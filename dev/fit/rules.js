/* The fit audit's rules: pure, over the candidate records collect.js reads
   from a page. Each finding is { rule, severity, sel, text, detail, box }.
   Pinned by tests/fit-audit.test.mjs; run by scripts/fit-audit.mjs.

   Content fits its box by construction (measured fit, wrapping, columns by
   count, "+N" folding): never by hidden overflow. So:
   - clip       text cut by an ancestor that hides overflow (ink past the box
                by more than CLIP_TOL; a cut descender is ink past the bottom)
   - ellipsis   a name or label truncated with an ellipsis or a line clamp,
                unless its element opts in with data-fit="ellipsis"
   - bounds     text or a control outside the canvas, the TV's safe area
                (64px sides, 54px top and bottom) or the phone's viewport;
                art that is meant to bleed opts out with data-fit="bleed"
   - overlap    two text lines, or a line and a control, or two controls,
                that are not nested and cross by more than OVERLAP_TOL
   - overlay    a fixed dock over content where the content cannot scroll
                clear of it (top docks at the top of the page, bottom docks
                at the bottom)
   - small      text rendered under 12px on the phone, 24px on the TV */

export const CLIP_TOL = 1;
export const OVERLAP_TOL = 2;
export const MIN_TEXT = Object.freeze({ phone:12, tv:24 });

const round = n => Math.round(n * 10) / 10;

export function clipFindings(records, { mode = "tv" } = {}) {
  const out = [];
  const byText = new Map();
  for (const c of records.clips || []) {
    const t = records.text[c.id];
    if (!t) continue;
    const worst = Math.max(c.over.left, c.over.right, c.over.top, c.over.bottom);
    if (worst <= CLIP_TOL) continue;
    /* an ellipsis truncates sideways, a line clamp at the bottom; a descender
       cut by an ellipsis box is still a clip */
    const truncated = c.trunc === "ellipsis" ? c.over.right > CLIP_TOL || c.over.left > CLIP_TOL
      : c.trunc === "clamp" ? c.over.bottom > CLIP_TOL : false;
    if (truncated && t.ellipsisOk) continue;
    const rule = truncated ? "ellipsis" : "clip";
    const key = `${rule}:${c.id}`;
    const prev = byText.get(key);
    if (prev && prev.worst >= worst) continue;
    const side = Object.entries(c.over).sort((a, b) => b[1] - a[1])[0][0];
    const descender = side === "bottom" && c.over.bottom < Math.max(4, t.fontPx * 0.35);
    byText.set(key, { rule, severity:rule === "ellipsis" || worst > t.fontPx * 0.3 ? "high" : "medium", sel:t.sel, text:t.text,
      detail:`${descender ? "descenders cut" : `cut ${round(worst)}px at the ${side}`} by ${c.clipSel}${truncated ? " (ellipsis)" : ""}`
        + ` · ${t.fontPx}px, line-height ${t.lineHeight}`,
      box:c.ink, worst, mode });
  }
  for (const [key, f] of byText) {
    /* a truncated line is reported once, as truncated */
    if (key.startsWith("clip:") && byText.has(`ellipsis:${key.slice(5)}`)) continue;
    delete f.worst; delete f.mode; out.push(f);
  }
  return out;
}

export function boundsFindings(records, { mode = "tv" } = {}) {
  const seen = new Set();
  const out = [];
  for (const b of records.bounds || []) {
    const t = b.id >= 0 ? records.text[b.id] : null;
    /* text mid-flight is judged where it lands */
    if (t?.moving) continue;
    const key = `${b.kind}:${t ? b.id : b.control}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const where = b.kind === "canvas" ? "outside the canvas" : b.kind === "safe" ? "outside the TV safe area" : "outside the viewport";
    out.push({ rule:"bounds", severity:b.kind === "safe" ? "medium" : "high", sel:t ? t.sel : b.control, text:t ? t.text : "",
      detail:`${where} by ${b.by}px${mode === "tv" ? " (canvas px)" : ""}`, box:b.ink, canvasBox:mode === "tv" });
  }
  return out;
}

export function overlapFindings(records) {
  const out = [];
  const seen = new Set();
  for (const o of records.overlaps || []) {
    if (o.x <= OVERLAP_TOL || o.y <= OVERLAP_TOL) continue;
    const key = [o.kind, o.a, o.b, o.at, o.bt].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ rule:"overlap", severity:o.kind === "control-control" || Math.min(o.x, o.y) > 6 ? "high" : "medium",
      sel:o.a, text:o.at, detail:`${o.kind}: crosses "${o.bt}" (${o.b}) by ${o.x}x${o.y}px`,
      box:union(o.box, o.box2) });
  }
  return out;
}

export function overlayFindings(records) {
  return (records.overlays || []).map(o => ({ rule:"overlay", severity:"high", sel:o.dock, text:"",
    detail:`${o.where} dock covers ${o.count} item${o.count === 1 ? "" : "s"} at the ${o.where} of the page: `
      + o.covered.slice(0, 4).map(c => `"${c.text}"`).join(", "), box:o.box, viewport:true }));
}

export function smallFindings(records, { mode = "tv" } = {}) {
  const min = MIN_TEXT[mode] || 12;
  const out = [];
  const seen = new Set();
  for (const s of records.small || []) {
    if (s.px >= min - 0.05) continue;
    const t = records.text[s.id];
    if (t.moving) continue;
    const key = `${t.sel}|${s.px}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ rule:"small", severity:s.px < min * 0.8 ? "high" : "medium", sel:t.sel, text:t.text,
      detail:`${s.px}px text (floor ${min}px)`, box:null, textId:s.id });
  }
  return out;
}

export function union(a, b) {
  if (!a) return b; if (!b) return a;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w:Math.max(a.x + a.w, b.x + b.w) - x, h:Math.max(a.y + a.h, b.y + b.h) - y };
}

/* every finding of one view, exceptions applied */
export function findingsFor(records, { mode = "tv", view = "", exceptions = [] } = {}) {
  const all = [...clipFindings(records, { mode }), ...boundsFindings(records, { mode }), ...overlapFindings(records),
    ...overlayFindings(records), ...smallFindings(records, { mode })];
  return all.map(f => {
    const ex = exceptions.find(e => (!e.view || new RegExp(e.view).test(view)) && (!e.rule || e.rule === f.rule)
      && (!e.sel || new RegExp(e.sel).test(f.sel)) && (!e.text || new RegExp(e.text).test(f.text)));
    return ex ? { ...f, view, excepted:ex.reason } : { ...f, view };
  });
}

/* the run's verdict: failing findings (not excepted) */
export const failing = findings => findings.filter(f => !f.excepted);

export function summarize(findings) {
  const by = {};
  for (const f of findings) {
    const k = f.excepted ? "excepted" : f.rule;
    by[k] = (by[k] || 0) + 1;
  }
  return by;
}
