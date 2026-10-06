/* The fit audit's in-page measurement (scripts/fit-audit.mjs serializes this
   function into the page). It reads geometry only, and returns candidate
   records with their numbers; the pure rules (dev/fit/rules.js) decide what
   is a finding. Self-contained: no imports, no closures over module scope.

   What it measures, inside the view's root (the topmost takeover on the TV,
   the open sheet on the phone, else the whole canvas or page):
   - every visible text line's ink box (glyph bounds from the font's own
     metrics, so a cut descender counts) against every ancestor that clips
     it (overflow hidden/clip; on the TV, where nothing scrolls, auto and
     scroll too), and whether that ancestor truncates with an ellipsis or a
     line clamp
   - the same ink boxes and every control against the canvas, the TV's safe
     area, or the phone's viewport
   - overlaps between text lines and controls that are not nested, and
     between text and opaque art marked data-fit-art (a chip stack)
   - each line's rendered font size (transforms included)
   - fixed overlays over content (the phone: top docks at the top of the
     page, bottom docks at the bottom, where content must be reachable) */
export function collectFit({ mode = "tv", phase = "full", ignore = "", safe = null } = {}) {
  const TV = mode === "tv";
  const cs = el => getComputedStyle(el);
  const name = el => {
    if (!el || el.nodeType !== 1) return "";
    const parts = [];
    let e = el;
    for (let i = 0; e && e.nodeType === 1 && i < 4 && e !== document.body; i++, e = e.parentElement) {
      let s = e.tagName.toLowerCase();
      const cls = typeof e.className === "string" ? e.className.trim().split(/\s+/).filter(c => c && !/^is-/.test(c)).slice(0, 2) : [];
      if (cls.length) s += "." + cls.join(".");
      parts.unshift(s);
    }
    return parts.join(" > ");
  };
  const box = r => ({ x:Math.round(r.left * 10) / 10, y:Math.round(r.top * 10) / 10,
    w:Math.round((r.right - r.left) * 10) / 10, h:Math.round((r.bottom - r.top) * 10) / 10 });
  const shown = el => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = cs(e);
      if (s.display === "none" || s.visibility === "hidden" || s.visibility === "collapse" || +s.opacity < 0.05) return false;
    }
    return true;
  };
  /* a closed <details> keeps its content laid out but unpainted */
  const folded = el => { const d = el.closest("details:not([open])"); return !!d && !el.closest("summary"); };
  const ignored = el => !!(ignore && el.closest(ignore)) || !!el.closest("[data-fit=skip], script, style, noscript, template") || folded(el);
  /* screen-reader text: a box of a pixel or two, whatever its text measures */
  const offscreen = el => { for (let e = el; e && e !== document.body; e = e.parentElement) {
    const r = e.getBoundingClientRect(); if (r.width <= 2 || r.height <= 2) return getComputedStyle(e).overflow !== "visible" || r.width <= 2 && r.height <= 2;
    if (e === root) break; } return false; };
  /* the dock a node rides in (fixed or sticky), or null: content and a dock
     are the overlay rule's pair, judged where the page can scroll clear */
  const dockCache = new Map();
  const dockOf = el => {
    if (dockCache.has(el)) return dockCache.get(el);
    let found = null;
    for (let e = el; e && e !== document.body; e = e.parentElement) { const p = cs(e).position; if (p === "fixed" || p === "sticky") found = e; }
    dockCache.set(el, found);
    return found;
  };

  /* the view's root */
  let root = document.body;
  const canvas = document.querySelector("[data-tv-canvas]");
  if (TV && canvas) {
    const layers = [...canvas.querySelectorAll(".tv-takeover, .tv-intro, .tv-reveal")].filter(el => shown(el) && el.getBoundingClientRect().width > 0);
    root = layers.length ? layers[layers.length - 1] : canvas;
  } else if (!TV) {
    const sheets = [...document.querySelectorAll("[role=dialog], [aria-modal=true]")]
      .filter(el => shown(el) && el.getBoundingClientRect().height > 40);
    if (sheets.length) root = sheets[sheets.length - 1];
  }
  const frame = TV && canvas ? canvas.getBoundingClientRect() : { left:0, top:0, width:innerWidth, height:innerHeight };
  const scale = TV && canvas ? frame.width / 1920 : 1;
  const toCanvas = r => TV ? { left:(r.left - frame.left) / scale, top:(r.top - frame.top) / scale,
    right:(r.right - frame.left) / scale, bottom:(r.bottom - frame.top) / scale } : r;

  /* clipping ancestors of an element, nearest first, up to the page */
  const clipCache = new Map();
  const clipsOf = el => {
    if (clipCache.has(el)) return clipCache.get(el);
    const out = [];
    /* on the phone a scroller makes its content reachable in its axis:
       nothing above it clips that axis for this text */
    let scrollX = false, scrollY = false;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      /* the TV canvas's own edge is the bounds rule's */
      if (TV && e === canvas) break;
      const s = cs(e);
      const clipX = TV ? s.overflowX !== "visible" : !scrollX && /hidden|clip/.test(s.overflowX);
      const clipY = TV ? s.overflowY !== "visible" : !scrollY && /hidden|clip/.test(s.overflowY);
      if (!TV && /auto|scroll/.test(s.overflowX)) scrollX = true;
      if (!TV && /auto|scroll/.test(s.overflowY)) scrollY = true;
      const clamp = s.webkitLineClamp && s.webkitLineClamp !== "none";
      if (clipX || clipY || clamp) {
        const r = e.getBoundingClientRect();
        const bl = parseFloat(s.borderLeftWidth) || 0, br = parseFloat(s.borderRightWidth) || 0;
        const bt = parseFloat(s.borderTopWidth) || 0, bb = parseFloat(s.borderBottomWidth) || 0;
        out.push({ el:e, x:clipX, y:clipY || clamp, trunc:clamp ? "clamp" : s.textOverflow === "ellipsis" ? "ellipsis" : null,
          left:r.left + bl, right:r.right - br, top:r.top + bt, bottom:r.bottom - bb });
      }
      if (e === document.body) break;
    }
    clipCache.set(el, out);
    return out;
  };
  const allowed = (el, kind) => !!el.closest(`[data-fit~="${kind}"]`);
  /* content in a sideways scroller (a bracket) is reached by scrolling it */
  const inScrollerX = el => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement)
    if (/auto|scroll/.test(cs(e).overflowX) && e.scrollWidth > e.clientWidth + 1) return true; return false; };

  /* text mid-flight (an element whose transform is still animating, or
     held at the start of one) is caught between frames: its size, overlap
     and place are judged at rest, its clipping always */
  const movers = new Set();
  for (const a of document.getAnimations ? document.getAnimations() : []) {
    const target = a.effect?.target;
    if (!target || a.playState === "finished") continue;
    let frames = [];
    try { frames = a.effect.getKeyframes(); } catch {}
    if (!frames.some(k => "transform" in k || "translate" in k || "scale" in k || "rotate" in k)) continue;
    const timing = a.effect.getComputedTiming();
    if (timing.progress === null && timing.currentIteration === null && (a.currentTime || 0) > 0) continue;
    if (timing.progress !== null && timing.progress >= 1 && timing.iterations !== Infinity) continue;
    movers.add(target);
  }
  const moving = el => { for (let e = el; e && e !== document.body; e = e.parentElement) if (movers.has(e)) return true; return false; };
  const ctx = (window.__fitCtx ||= document.createElement("canvas").getContext("2d"));
  const records = { text:[], clips:[], bounds:[], small:[], overlaps:[], overlays:[], counts:{} };
  const lines = [];
  const controls = [];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode:node => node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
  const seen = new Set();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    if (!el || ignored(el) || !shown(el) || offscreen(el)) continue;
    const s = cs(el);
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter(r => r.width > 0.5 && r.height > 0.5);
    if (!rects.length) continue;
    const outer = range.getBoundingClientRect();
    if (outer.width <= 2 && outer.height <= 2) continue;
    const fontPx = parseFloat(s.fontSize) || 0;
    /* the rendered size: a scaled ancestor shrinks the glyphs too */
    const own = el.getBoundingClientRect();
    const ctm = el instanceof SVGElement ? el.getScreenCTM?.() : null;
    const raw = ctm ? Math.hypot(ctm.a, ctm.b) : el.offsetHeight > 0 && own.height > 0 ? own.height / el.offsetHeight : 1;
    /* offsetHeight is whole pixels: a few percent is rounding, not a transform */
    const k = Math.abs(raw - 1) < 0.04 ? 1 : raw;
    const rendered = fontPx * k / scale;
    let text = node.textContent.replace(/\s+/g, " ").trim();
    if (s.textTransform === "uppercase") text = text.toUpperCase();
    ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const m = ctx.measureText(text || "x");
    const fAsc = m.fontBoundingBoxAscent, fDesc = m.fontBoundingBoxDescent;
    const inkAsc = Math.max(m.actualBoundingBoxAscent, 0), inkDesc = Math.max(m.actualBoundingBoxDescent, 0);
    const id = records.text.length;
    records.text.push({ id, sel:name(el), text:text.slice(0, 60), fontPx:Math.round(rendered * 10) / 10,
      lineHeight:s.lineHeight, ellipsisOk:allowed(el, "ellipsis"), moving:moving(el) });
    if (!seen.has(el)) { seen.add(el); }
    let kept = 0;
    const clips = clipsOf(el);
    rects.forEach((r, li) => {
      /* the line box holds the font's ascent and descent around the
         baseline; the ink sits inside it by the glyphs' own metrics */
      const lineH = r.height;
      const content = (fAsc + fDesc) * k;
      const top = r.top + (lineH - content) / 2;
      const ink = { left:r.left, right:r.right, top:top + (fAsc - inkAsc) * k, bottom:top + (fAsc + inkDesc) * k };
      /* a line wholly outside a box that clips it is not on screen at all (a
         collapsed panel, a carousel's next card): nothing to judge */
      const gone = clips.some(c => (c.x && (ink.right <= c.left || ink.left >= c.right))
        || (c.y && (ink.bottom <= c.top || ink.top >= c.bottom)));
      if (gone) return;
      kept++;
      /* text that opts into an ellipsis shows only what fits its own
         ellipsis box: the rest is not on screen to overlap or leave it */
      if (allowed(el, "ellipsis")) {
        const cut = clips.find(c => c.trunc === "ellipsis" && c.x);
        if (cut) { ink.left = Math.max(ink.left, cut.left); ink.right = Math.min(ink.right, cut.right); }
      }
      lines.push({ id, el, ink });
      for (const c of clips) {
        if (c.el === el && !c.x && !c.y) continue;
        const over = {
          left:c.x ? c.left - ink.left : 0, right:c.x ? ink.right - c.right : 0,
          top:c.y ? c.top - ink.top : 0, bottom:c.y ? ink.bottom - c.bottom : 0,
        };
        const worst = Math.max(over.left, over.right, over.top, over.bottom);
        if (worst > 0.25) records.clips.push({ id, line:li, clipSel:name(c.el), trunc:c.trunc,
          over:Object.fromEntries(Object.entries(over).map(([key, v]) => [key, Math.round(v * 10) / 10])),
          ink:box(ink), clip:box(c), hidden:worst > Math.max(ink.bottom - ink.top, 1) * 0.95 && over.left < 0 });
      }
      const cb = toCanvas(ink);
      const bleed = allowed(el, "bleed");
      if (TV) {
        const S = safe || { x:64, y:54 };
        const out = { left:-cb.left, right:cb.right - 1920, top:-cb.top, bottom:cb.bottom - 1080 };
        const unsafe = { left:S.x - cb.left, right:cb.right - (1920 - S.x), top:S.y - cb.top, bottom:cb.bottom - (1080 - S.y) };
        const worstOut = Math.max(...Object.values(out)), worstSafe = Math.max(...Object.values(unsafe));
        if (worstOut > 0.5 || (worstSafe > 0.5 && !bleed))
          records.bounds.push({ id, line:li, kind:worstOut > 0.5 ? "canvas" : "safe", by:Math.round(Math.max(worstOut, worstSafe)),
            ink:box(cb) });
      } else {
        const out = Math.max(-cb.left, cb.right - innerWidth);
        if (out > 0.5 && !inScrollerX(el)) records.bounds.push({ id, line:li, kind:"viewport", by:Math.round(out), ink:box(cb) });
      }
    });
    if (kept && rendered > 0) records.small.push({ id, px:Math.round(rendered * 10) / 10 });
  }
  records.counts.text = records.text.length;

  /* controls: their rects, for overlaps and bounds */
  const ctrlSel = "button, a[href], input:not([type=hidden]), select, textarea, [role=button], summary";
  for (const el of root.querySelectorAll(ctrlSel)) {
    if (ignored(el) || !shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (clipsOf(el.parentElement || el).some(c => (c.x && (r.right <= c.left || r.left >= c.right)) || (c.y && (r.bottom <= c.top || r.top >= c.bottom)))) continue;
    controls.push({ el, r, sel:name(el), label:(el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40) });
    if (!TV) {
      const out = Math.max(-r.left, r.right - innerWidth);
      if (out > 0.5 && !inScrollerX(el)) records.bounds.push({ id:-1, control:name(el), kind:"viewport", by:Math.round(out), ink:box(r) });
    }
  }
  records.counts.controls = controls.length;

  /* overlaps: text lines of different, non-nested elements; a line and a
     control it is not inside; two controls not nested */
  if (phase === "full") {
    const meet = (a, b) => ({ x:Math.min(a.right, b.right) - Math.max(a.left, b.left), y:Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) });
    const textOf = id => records.text[id];
    const sorted = lines.slice().sort((a, b) => a.ink.left - b.ink.left);
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      for (let j = i + 1; j < sorted.length && sorted[j].ink.left < a.ink.right; j++) {
        const b = sorted[j];
        if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
        if (textOf(a.id).moving || textOf(b.id).moving) continue;
        if (!TV && dockOf(a.el) !== dockOf(b.el)) continue;
        const o = meet(a.ink, b.ink);
        const ta = textOf(a.id).text, tb = textOf(b.id).text;
        /* a lettering and its mirror copy (a plate's front and back) */
        if (ta === tb && a.el.parentElement === b.el.parentElement) continue;
        const area = r => (r.right - r.left) * (r.bottom - r.top);
        if (ta === tb && o.x * o.y > 0.8 * Math.max(area(a.ink), area(b.ink))) continue;
        if (o.x > 1 && o.y > 1) records.overlaps.push({ kind:"text-text", a:textOf(a.id).sel, at:textOf(a.id).text,
          b:textOf(b.id).sel, bt:textOf(b.id).text, x:Math.round(o.x), y:Math.round(o.y), box:box(a.ink), box2:box(b.ink) });
      }
    }
    for (const c of controls) {
      for (const l of lines) {
        if (c.el.contains(l.el) || l.el.contains(c.el) || textOf(l.id).moving) continue;
        if (!TV && dockOf(c.el) !== dockOf(l.el)) continue;
        const o = meet(c.r, l.ink);
        if (o.x > 1 && o.y > 1) records.overlaps.push({ kind:"text-control", a:c.sel, at:c.label, b:textOf(l.id).sel,
          bt:textOf(l.id).text, x:Math.round(o.x), y:Math.round(o.y), box:box(c.r), box2:box(l.ink) });
      }
    }
    /* reserved regions (data-fit-region: the TV's masthead plates and
       ticker plate): text from elsewhere must not run into them */
    for (const region of root.querySelectorAll("[data-fit-region]")) {
      if (!shown(region)) continue;
      const r = region.getBoundingClientRect();
      const zone = region.parentElement || region;
      for (const l of lines) {
        if (zone.contains(l.el) || textOf(l.id).moving) continue;
        const o = meet(r, l.ink);
        if (o.x > 1 && o.y > 1) records.overlaps.push({ kind:"region", a:textOf(l.id).sel, at:textOf(l.id).text,
          b:`the ${region.getAttribute("data-fit-region")}`, bt:region.getAttribute("data-fit-region"), x:Math.round(o.x), y:Math.round(o.y),
          box:box(l.ink), box2:box(r) });
      }
    }
    /* opaque art (data-fit-art: a bet's chip stack) covers what is under
       it: no text line from elsewhere may stand under or over its visible
       part (the part its clipping boxes leave on screen) */
    for (const art of root.querySelectorAll("[data-fit-art]")) {
      if (ignored(art) || !shown(art) || moving(art)) continue;
      const a = art.getBoundingClientRect();
      const seen = { left:a.left, right:a.right, top:a.top, bottom:a.bottom };
      for (const c of clipsOf(art.parentElement || art)) {
        if (c.x) { seen.left = Math.max(seen.left, c.left); seen.right = Math.min(seen.right, c.right); }
        if (c.y) { seen.top = Math.max(seen.top, c.top); seen.bottom = Math.min(seen.bottom, c.bottom); }
      }
      if (seen.right - seen.left < 2 || seen.bottom - seen.top < 2) continue;
      for (const l of lines) {
        if (art.contains(l.el) || l.el.contains(art) || textOf(l.id).moving) continue;
        if (!TV && dockOf(art) !== dockOf(l.el)) continue;
        const o = meet(seen, l.ink);
        if (o.x > 1 && o.y > 1) records.overlaps.push({ kind:"art-text", a:textOf(l.id).sel, at:textOf(l.id).text,
          b:name(art), bt:art.getAttribute("data-fit-art") || "art", x:Math.round(o.x), y:Math.round(o.y),
          box:box(l.ink), box2:box(seen) });
      }
      /* a score reel's digits ride a strip the audit does not read as text
         (a window by design): the reel's own box stands in for them */
      for (const reel of root.querySelectorAll(".fd-reel")) {
        if (art.contains(reel) || reel.contains(art) || ignored(reel) || !shown(reel) || moving(reel)) continue;
        if (!TV && dockOf(art) !== dockOf(reel)) continue;
        const r = reel.getBoundingClientRect();
        const o = meet(seen, r);
        if (o.x > 1 && o.y > 1) records.overlaps.push({ kind:"art-text", a:name(reel),
          at:reel.getAttribute("aria-label") || "reel", b:name(art), bt:art.getAttribute("data-fit-art") || "art",
          x:Math.round(o.x), y:Math.round(o.y), box:box(r), box2:box(seen) });
      }
    }
    for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i], b = controls[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (!TV && dockOf(a.el) !== dockOf(b.el)) continue;
      const o = meet(a.r, b.r);
      if (o.x > 1 && o.y > 1) records.overlaps.push({ kind:"control-control", a:a.sel, at:a.label, b:b.sel, bt:b.label,
        x:Math.round(o.x), y:Math.round(o.y), box:box(a.r), box2:box(b.r) });
    }
  }

  /* fixed overlays over content (the phone): a dock at the top is checked
     at the top of the page, one at the bottom at the bottom of the page */
  if (!TV) {
    const fixedish = el => { for (let e = el; e && e !== document.body; e = e.parentElement) {
      const p = cs(e).position; if (p === "fixed" || p === "sticky") return e; } return null; };
    /* a toast or a receipt passes over the page for a moment; it is not a dock */
    const transient = ".fd-toast, .fd-receipt, .fd-chip-receipt, [role=alert], [data-fit~=transient]";
    const docks = [...document.querySelectorAll("body *")].filter(el => {
      const p = cs(el).position;
      if (p !== "fixed" && p !== "sticky") return false;
      if (el.matches(transient)) return false;
      if (!shown(el) || ignored(el)) return false;
      const parent = el.parentElement && fixedish(el.parentElement);
      if (parent) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && !(r.width >= innerWidth * 0.98 && r.height >= innerHeight * 0.9);
    });
    for (const d of docks) {
      const r = d.getBoundingClientRect();
      const bottomDock = r.top + r.height / 2 > innerHeight / 2;
      if ((phase === "top" && bottomDock) || (phase === "bottom" && !bottomDock) || phase === "full") continue;
      if (root !== document.body && !root.contains(d) && !d.contains(root)) continue;
      const covered = [];
      for (const l of lines) {
        if (d.contains(l.el) || fixedish(l.el)) continue;
        const ix = Math.min(r.right, l.ink.right) - Math.max(r.left, l.ink.left), iy = Math.min(r.bottom, l.ink.bottom) - Math.max(r.top, l.ink.top);
        if (ix > 2 && iy > 2) covered.push({ sel:records.text[l.id].sel, text:records.text[l.id].text, x:Math.round(ix), y:Math.round(iy) });
      }
      for (const c of controls) {
        if (d.contains(c.el) || c.el.contains(d) || fixedish(c.el)) continue;
        const ix = Math.min(r.right, c.r.right) - Math.max(r.left, c.r.left), iy = Math.min(r.bottom, c.r.bottom) - Math.max(r.top, c.r.top);
        if (ix > 2 && iy > 2) covered.push({ sel:c.sel, text:c.label, x:Math.round(ix), y:Math.round(iy), control:true });
      }
      if (covered.length) records.overlays.push({ dock:name(d), where:bottomDock ? "bottom" : "top", box:box(r),
        covered:covered.slice(0, 12), count:covered.length });
    }
  }
  /* the first screen (the phone, at the top of the page): an element marked
     data-fit-fold (Home's leaderboard heading during the weekend) must sit
     whole above the bottom docks (the tab bar, the commissioner's dock) */
  if (!TV && phase === "top" && root === document.body) {
    const mark = [...document.querySelectorAll("[data-fit-fold]")].find(el => shown(el) && el.getBoundingClientRect().height > 0);
    if (mark) {
      let limit = innerHeight;
      for (const el of document.querySelectorAll("body *")) {
        if (cs(el).position !== "fixed" || !shown(el) || el.matches(".fd-toast, .fd-receipt, .fd-chip-receipt, [role=alert], [data-fit~=transient]")) continue;
        const d = el.getBoundingClientRect();
        if (d.height <= 0 || d.height > innerHeight / 2 || d.bottom < innerHeight - 2 || d.top < innerHeight / 2) continue;
        limit = Math.min(limit, d.top);
      }
      const r = mark.getBoundingClientRect();
      records.fold = { sel:name(mark), text:(mark.textContent || "").trim().slice(0, 40), top:Math.round(r.top), bottom:Math.round(r.bottom),
        limit:Math.round(limit), vh:innerHeight };
    }
  }
  records.scrollY = scrollY;
  records.docH = document.scrollingElement.scrollHeight;
  records.docW = document.scrollingElement.scrollWidth;
  records.vw = innerWidth; records.vh = innerHeight;
  records.root = name(root) || "body";
  return records;
}
