import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const input = new URL("../docs/product-audit-2026-09-07.json", import.meta.url);
const output = new URL("../docs/product-audit-2026-09-07.html", import.meta.url);
const data = JSON.parse(await readFile(input, "utf8"));
const fields = ["id", "priority", "title", "problem", "repro", "change", "acceptance", "source"];
if (typeof data.date !== "string" || typeof data.summary !== "string" || !Array.isArray(data.findings))
  throw new Error("Audit requires date, summary, and findings");
const ids = new Set();
for (const finding of data.findings) {
  if (fields.some(field => typeof finding[field] !== "string")
      || !Array.isArray(finding.roles) || !Array.isArray(finding.proof)
      || [...finding.roles, ...finding.proof].some(value => typeof value !== "string"))
    throw new Error(`Invalid finding: ${finding.id || "missing ID"}`);
  if (!finding.id || ids.has(finding.id)) throw new Error(`Finding IDs must be unique: ${finding.id}`);
  ids.add(finding.id);
}
const direction = data.direction || null;
if (direction) {
  if (["headline", "thesis", "scope", "recommendation"].some(field => typeof direction[field] !== "string")
      || !Array.isArray(direction.proposals)) throw new Error("Invalid product direction");
  for (const proposal of direction.proposals) {
    if (["id", "title", "change", "example", "impact", "newCapability", "guardrail", "proof"].some(field => typeof proposal[field] !== "string"))
      throw new Error(`Invalid direction proposal: ${proposal.id || "missing ID"}`);
  }
}
const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
const attr = escape;
const priorities = [...new Set(data.findings.map(finding => finding.priority))].sort();
const roles = ["Commissioner", "Player", "TV"].filter(role => data.findings.some(finding => finding.roles.includes(role)));
const count = predicate => data.findings.filter(predicate).length;
const badges = (values, className = "badge") => values.map(value => `<span class="${className}">${escape(value)}</span>`).join("");
const sourceLink = source => /^[A-Za-z0-9._-]+\.md(?:#[A-Za-z0-9._-]+)?$/.test(source)
  ? `<a href="./${attr(source)}">${escape(source)}</a>` : escape(source);
const sections = [ ["problem", "Problem"], ["repro", "Reproduce"], ["change", "Recommended change"], ["acceptance", "Acceptance"] ];
const p1 = data.findings.filter(finding => finding.priority === "P1");
const title = `${data.findings.length} findings across the product`;
const findingId = index => `finding-${index + 1}`;
const date = /^\d{4}-\d{2}-\d{2}$/.test(data.date)
  ? new Intl.DateTimeFormat("en-US", { month:"long", day:"numeric", year:"numeric", timeZone:"UTC" }).format(new Date(`${data.date}T12:00:00Z`))
  : data.date;
const proposalDetails = [["impact", "Impact"], ["newCapability", "What changes"], ["guardrail", "Guardrails"], ["proof", "How to test it"]];
const directionContent = direction ? `<section class="direction-content" aria-label="Product direction proposals">
  <p class="direction-scope">${escape(direction.scope)}</p>
  <div class="direction-recommendation"><h2>Build first</h2><p>${escape(direction.recommendation)}</p><a href="./PRODUCT-DIRECTION-2026-09-07.md">Read the full product direction <span aria-hidden="true">↗</span></a></div>
  <div class="section-line proposal-section-heading"><h2>Proposed experiences</h2><span>${direction.proposals.length} proposals</span></div>
  <div class="proposals">${direction.proposals.map((proposal, index) => `<article class="proposal" id="proposal-${index + 1}" aria-labelledby="proposal-title-${index + 1}">
    <div class="proposal-heading"><span class="proposal-id">${escape(proposal.id)}</span><h3 id="proposal-title-${index + 1}">${escape(proposal.title)}</h3></div>
    <div class="proposal-preview"><p class="proposal-change">${escape(proposal.change)}</p><div class="proposal-example"><h4>In practice</h4><p>${escape(proposal.example)}</p></div></div>
    <details class="proposal-detail"><summary><span>Impact, scope and validation</span><span class="toggle" aria-hidden="true">+</span></summary><div class="proposal-detail-body">${proposalDetails.map(([field, label]) => `<section><h4>${label}</h4><p>${escape(proposal[field])}</p></section>`).join("")}</div></details>
  </article>`).join("\n")}</div>
</section>` : "";
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Field Day ${direction ? "product direction and audit" : "product audit"} · ${escape(data.date)}</title>
<style>
:root{color-scheme:dark;--bg:#111a18;--paper:#192420;--paper2:#22302a;--ink:#f0ede1;--dim:#b0beb3;--line:#3a4b40;--green:#bed3bf;--sun:#e3d17a;--black:#111a18;--radius:12px}
*{box-sizing:border-box}html{scroll-padding-top:220px}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button,input,select{font:inherit}a{color:var(--green);text-underline-offset:4px}button,a,input,select,summary{-webkit-tap-highlight-color:transparent}button{cursor:pointer}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid var(--sun);outline-offset:4px}button:disabled{cursor:default}main{max-width:1120px;margin:auto;padding:34px 28px 56px}.skip{position:fixed;top:-80px;left:12px;z-index:10;padding:10px 14px;background:var(--sun);color:var(--black)}.skip:focus{top:12px}.eyebrow{display:flex;align-items:center;justify-content:space-between;gap:16px;color:var(--dim);font-size:12px;letter-spacing:.08em;text-transform:uppercase}.wordmark{font-weight:750;color:var(--green)}h1{max-width:850px;font-size:clamp(34px,5vw,56px);line-height:1.07;letter-spacing:-.045em;margin:28px 0 18px;font-weight:720}h2{font-size:20px;line-height:1.3;letter-spacing:-.02em;margin:0}h3{font-size:12px;line-height:1.5;margin:0 0 8px;color:var(--green);letter-spacing:.055em;text-transform:uppercase}p{margin:0}.overview{max-width:880px;color:var(--dim);font-size:16px;line-height:1.65;white-space:pre-line}.rollup{display:flex;gap:10px;flex-wrap:wrap;margin:26px 0 14px}.metric{display:flex;align-items:baseline;gap:10px;padding:12px 18px;background:var(--paper);border:1px solid var(--line);border-radius:var(--radius);min-width:122px}.metric strong{font-size:28px;line-height:1;font-weight:650}.metric span{font-size:12px;color:var(--dim)}.metric.is-p1{border-color:var(--sun)}.metric.is-p1 strong{color:var(--sun)}.role-counts{display:flex;gap:8px;flex-wrap:wrap}.badge,.proof,.role-count{display:inline-flex;align-items:center;font-size:11px;line-height:1.4;padding:4px 8px;border:1px solid var(--line);border-radius:6px;color:var(--dim)}.role-count{gap:8px}.role-count b{color:var(--ink);font-weight:650}.highest{margin:32px 0 30px;padding:22px;background:var(--paper);border:1px solid var(--line);border-left:3px solid var(--sun);border-radius:var(--radius)}.section-line{display:flex;justify-content:space-between;gap:16px;align-items:baseline}.section-line>span{color:var(--dim);font-size:12px}.priority-list{list-style:none;margin:14px 0 0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:0 24px}.priority-list li{border-top:1px solid var(--line)}.priority-jump{display:flex;align-items:center;gap:10px;width:100%;min-height:56px;padding:12px 0;background:none;border:0;text-align:left;color:var(--ink);font-size:13px;line-height:1.45}.priority-jump small{color:var(--sun);font:600 11px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;flex-shrink:0}.priority-jump span{flex:1}.arrow{color:var(--dim)}.toolbar{position:sticky;top:0;z-index:3;background:var(--bg);padding:16px 0;border-bottom:1px solid var(--line);margin-bottom:14px}.filter-row{display:flex;align-items:end;gap:12px}.search{flex:1}.filter-field label{display:block;font-size:12px;color:var(--dim);margin:0 0 6px}input,select{height:44px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);padding:8px 12px;width:100%;min-width:0}input::placeholder{color:var(--dim)}select{min-width:155px}.roles{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}.role-button,.quiet{min-height:44px;padding:8px 13px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--dim);font-size:12px}.role-button[aria-pressed="true"]{background:var(--green);color:var(--black);border-color:var(--green);font-weight:650}.tools-line{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:18px 0 12px}.tools-line p{color:var(--dim);font-size:12px}.tools-line p strong{color:var(--ink)}.tools-actions{display:flex;gap:6px}.quiet{background:none;padding:8px 10px}.finding{border:1px solid var(--line);border-radius:var(--radius);background:var(--paper);margin:0 0 10px;overflow:hidden}.finding[hidden]{display:none}.finding[open]{border-color:#6f8775}.finding summary{display:flex;align-items:center;gap:14px;list-style:none;cursor:pointer;min-height:90px;padding:18px 20px}.finding summary::-webkit-details-marker{display:none}.severity{display:grid;place-items:center;align-self:flex-start;min-width:36px;min-height:30px;border:1px solid var(--line);border-radius:6px;color:var(--dim);font-weight:650;font-size:11px}.severity.is-p1{background:var(--sun);border-color:var(--sun);color:var(--black)}.finding-heading{min-width:0;flex:1}.finding-heading strong{display:block;font-size:16px;line-height:1.4;font-weight:630;letter-spacing:-.015em}.finding-meta{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:9px}.finding-code{color:var(--dim);font:11px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;margin-right:4px}.toggle{color:var(--green);font-size:22px;flex-shrink:0;line-height:1}.finding[open] .toggle{transform:rotate(45deg)}.finding-body{border-top:1px solid var(--line);padding:22px 24px 24px 70px;display:grid;grid-template-columns:1fr 1fr;gap:24px}.finding-body section:first-child{grid-column:1/-1}.finding-body p{font-size:14px;line-height:1.65;white-space:pre-line;overflow-wrap:anywhere}.finding-body section:last-of-type{background:var(--paper2);padding:15px 17px;border-radius:8px}.evidence{grid-column:1/-1;display:flex;align-items:center;gap:7px;flex-wrap:wrap;color:var(--dim);font-size:11px}.evidence-label{margin-right:2px}.proof{color:var(--green)}.sources{grid-column:1/-1;border-top:1px solid var(--line);padding-top:15px}.sources p{font:12px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--dim)}.empty{padding:44px 20px;text-align:center;color:var(--dim);border:1px dashed var(--line);border-radius:var(--radius)}.empty[hidden]{display:none}.empty button{margin-top:16px}footer{margin-top:34px;border-top:1px solid var(--line);padding-top:20px;color:var(--dim);font-size:12px}footer nav{display:flex;flex-wrap:wrap;gap:8px 20px;margin-top:10px}footer a{min-height:44px;display:inline-flex;align-items:center}noscript p{padding:14px;border:1px solid var(--line);color:var(--dim)}
@media(max-width:700px){main{padding:24px 16px 40px}.eyebrow{align-items:start;font-size:10px;gap:12px}.eyebrow time{text-align:right}h1{margin-top:24px}.overview{font-size:14px}.metric{min-width:95px;padding:10px 12px}.metric strong{font-size:24px}.rollup{gap:7px}.highest{padding:18px 16px;margin:26px 0 18px}.priority-list{grid-template-columns:1fr}.section-line{align-items:center}.section-line>span{max-width:110px;text-align:right}.filter-row{align-items:stretch;flex-wrap:wrap}.search{flex-basis:100%}.priority-field{flex:1}.toolbar{padding:12px 0}.roles{gap:5px}.role-button{padding:8px 10px}.finding summary{padding:16px 14px;gap:10px;align-items:flex-start}.finding-heading strong{font-size:15px}.finding-body{padding:18px 16px;grid-template-columns:1fr;gap:21px}.finding-body section{grid-column:1/-1}.finding-body p{font-size:13px}.toggle{margin-top:3px}.finding-meta{gap:4px}.badge{font-size:10px}.tools-actions{width:100%}.quiet{flex:1}html{scroll-padding-top:280px}}
@media print{body{background:white;color:black}main{max-width:none;padding:0}.toolbar,.tools-actions,.priority-jump .arrow,.toggle,.skip,.empty,footer{display:none!important}.finding,.highest{background:white;border:1px solid #999;break-inside:avoid}.finding[hidden]{display:block}.finding-body{display:grid!important}.finding summary{break-after:avoid}.finding-body p,.overview,.finding-meta,.badge,.sources p,h3,.proof,.severity{color:black}.metric,.role-count{background:white;color:black;border-color:#999}.metric strong,.metric span,.metric.is-p1 strong,.eyebrow,.wordmark{color:black}.highest{border-left-color:#999}}
.report-nav{display:flex;flex-wrap:wrap;gap:8px 20px;margin-top:18px}.report-nav a{display:inline-flex;align-items:center;min-height:44px;font-size:13px}.direction-content{margin:12px 0 44px}.direction-scope{max-width:870px;color:var(--dim);font-size:13px;white-space:pre-line}.direction-recommendation{margin:26px 0 34px;padding:22px 24px;background:var(--paper2);border-left:3px solid var(--sun);border-radius:var(--radius)}.direction-recommendation h2{color:var(--sun);font-size:17px;margin-bottom:10px}.direction-recommendation p{max-width:900px;font-size:15px;line-height:1.7;white-space:pre-line}.direction-recommendation a{display:inline-flex;align-items:center;gap:8px;min-height:44px;margin-top:10px;font-size:12px}.proposal-section-heading{margin-bottom:16px}.proposals{display:grid;gap:16px}.proposal{border:1px solid var(--line);border-radius:var(--radius);background:var(--paper);overflow:hidden}.proposal-heading{display:flex;align-items:flex-start;gap:14px;padding:22px 24px 16px}.proposal-id{display:grid;place-items:center;flex-shrink:0;width:34px;min-height:30px;border:1px solid var(--line);border-radius:6px;color:var(--sun);font:600 12px/1 ui-monospace,SFMono-Regular,Consolas,monospace}.proposal-heading h3{margin:0;color:var(--ink);font-size:21px;line-height:1.4;font-weight:620;letter-spacing:-.025em;text-transform:none}.proposal-preview{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:0 24px 22px 72px;align-items:start}.proposal p{font-size:14px;line-height:1.7;white-space:pre-line;overflow-wrap:anywhere}.proposal-example{padding-left:18px;border-left:2px solid var(--line);color:var(--dim)}.proposal h4{font-size:11px;line-height:1.5;margin:0 0 7px;text-transform:uppercase;letter-spacing:.07em;color:var(--green)}.proposal-detail{border-top:1px solid var(--line)}.proposal-detail summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:48px;padding:12px 24px 12px 72px;color:var(--green);font-size:12px;cursor:pointer}.proposal-detail summary::-webkit-details-marker{display:none}.proposal-detail[open] .toggle{transform:rotate(45deg)}.proposal-detail-body{display:grid;grid-template-columns:1fr 1fr;gap:22px 28px;padding:10px 24px 24px 72px}.proposal-detail-body p{font-size:13px;color:var(--dim)}.audit-intro{border-top:1px solid var(--line);padding-top:30px}.audit-intro h2{font-size:clamp(25px,4vw,34px);line-height:1.2;margin-bottom:15px}.audit-intro .overview{font-size:14px}.toolbar[hidden],.tools-actions[hidden]{display:none}
@media(max-width:700px){.direction-content{margin-bottom:30px}.direction-recommendation{padding:19px 18px;margin:22px 0 28px}.direction-recommendation p{font-size:14px}.proposal-heading{padding:18px 16px 14px;gap:10px}.proposal-heading h3{font-size:19px;line-height:1.35}.proposal-preview{grid-template-columns:1fr;padding:0 16px 18px;gap:16px}.proposal-example{padding-left:13px}.proposal p{font-size:14px}.proposal-detail summary{padding:12px 16px}.proposal-detail-body{grid-template-columns:1fr;padding:6px 16px 20px;gap:18px}.proposal-id{width:30px;min-height:27px}.audit-intro{padding-top:24px}.report-nav{gap:4px 18px}}
@media print{.proposal,.direction-recommendation{background:white;border-color:#999;break-inside:avoid}.proposal-detail-body{display:grid!important}.proposal p,.proposal h3,.proposal h4,.proposal-id,.direction-recommendation h2,.direction-scope,.proposal-detail summary{color:black}.report-nav{display:none}}
</style>
</head>
<body>
<a class="skip" href="#findings">Skip to findings</a>
<main>
<header${direction ? ' id="direction"' : ""}>
  <div class="eyebrow"><span class="wordmark">Field Day · ${direction ? "Product direction" : "Product audit"}</span><time datetime="${attr(data.date)}">${escape(date)}</time></div>
  <h1>${escape(direction?.headline || title)}</h1>
  <p class="overview">${escape(direction?.thesis || data.summary)}</p>
  ${direction ? `<nav class="report-nav" aria-label="Report sections"><a href="#direction">Product direction</a><a href="#audit">Audit · ${data.findings.length} findings</a><a href="./PRODUCT-DIRECTION-2026-09-07.md">Detailed proposal</a></nav>` : ""}
</header>
${directionContent}
<section${direction ? ' class="audit-intro" id="audit" aria-labelledby="audit-heading"' : ' aria-label="Audit overview"'}>
  ${direction ? `<h2 id="audit-heading">${escape(title)}</h2><p class="overview">${escape(data.summary)}</p>` : ""}
  <div class="rollup" aria-label="Findings by priority">${priorities.map(priority => `<div class="metric${priority === "P1" ? " is-p1" : ""}"><strong>${count(finding => finding.priority === priority)}</strong><span>${escape(priority)} findings</span></div>`).join("")}</div>
  <div class="role-counts" aria-label="Findings by role">${roles.map(role => `<span class="role-count">${escape(role)}<b>${count(finding => finding.roles.includes(role))}</b></span>`).join("")}</div>
</section>
${p1.length ? `<section class="highest" aria-labelledby="priority-heading"><div class="section-line"><h2 id="priority-heading">Highest priority</h2><span>${p1.length} P1 finding${p1.length === 1 ? "" : "s"}</span></div><ul class="priority-list">${p1.map(finding => `<li><button type="button" class="priority-jump" data-jump="${findingId(data.findings.indexOf(finding))}"><small>${escape(finding.id)}</small><span>${escape(finding.title)}</span><b class="arrow" aria-hidden="true">↗</b></button></li>`).join("")}</ul></section>` : ""}
<section id="findings" aria-label="Audit findings">
  <noscript><p>All findings are available below. Enable JavaScript for filters and search.</p></noscript>
  <div class="toolbar" hidden id="toolbar">
    <div class="filter-row"><div class="filter-field search"><label for="search">Search findings</label><input id="search" type="search" placeholder="Find an action, screen, or failure" autocomplete="off"></div><div class="filter-field priority-field"><label for="priority">Priority</label><select id="priority"><option value="">All priorities</option>${priorities.map(priority => `<option value="${attr(priority)}">${escape(priority)}</option>`).join("")}</select></div></div>
    <div class="roles" role="group" aria-label="Filter by role"><button type="button" class="role-button" data-role="" aria-pressed="true">All roles</button>${roles.map(role => `<button type="button" class="role-button" data-role="${attr(role)}" aria-pressed="false">${escape(role)}</button>`).join("")}</div>
  </div>
  <div class="tools-line"><p id="result-count" role="status" aria-live="polite"><strong>${data.findings.length}</strong> of ${data.findings.length} findings</p><div class="tools-actions" hidden id="tools-actions"><button type="button" class="quiet" id="expand-all">Expand visible</button><button type="button" class="quiet" id="collapse-all">Collapse visible</button><button type="button" class="quiet" id="reset">Clear filters</button></div></div>
  ${data.findings.map((finding, index) => `<details class="finding" id="${findingId(index)}" data-priority="${attr(finding.priority)}" data-roles="${attr(JSON.stringify(finding.roles))}">
    <summary><span class="severity${finding.priority === "P1" ? " is-p1" : ""}">${escape(finding.priority)}</span><span class="finding-heading"><strong>${escape(finding.title)}</strong><span class="finding-meta"><span class="finding-code">${escape(finding.id)}</span>${badges(finding.roles)}</span></span><span class="toggle" aria-hidden="true">+</span></summary>
    <div class="finding-body">${sections.map(([field, label]) => `<section><h3>${label}</h3><p>${escape(finding[field])}</p></section>`).join("")}<div class="evidence"><span class="evidence-label">Evidence</span>${badges(finding.proof, "proof")}</div><div class="sources"><h3>Source</h3><p>${sourceLink(finding.source)}</p></div></div>
  </details>`).join("\n")}
  <div class="empty" id="empty" hidden><p>No findings match these filters.</p><button type="button" class="quiet" id="empty-reset">Clear filters</button></div>
</section>
<footer><p>Detailed evidence and role journeys</p><nav aria-label="Detailed audit reports">${direction ? '<a href="./PRODUCT-DIRECTION-2026-09-07.md">Product direction</a>' : ""}<a href="./PRODUCT-E2E-2026-09-07.md">Full audit</a><a href="./audit-commissioner-concurrency-2026-09-07.md">Commissioner</a><a href="./audit-player-2026-09-07.md">Player</a><a href="./audit-tv-2026-09-07.md">TV</a></nav></footer>
</main>
<script>
(() => {
  const cards = [...document.querySelectorAll('.finding')];
  const search = document.querySelector('#search');
  const priority = document.querySelector('#priority');
  const roleButtons = [...document.querySelectorAll('[data-role]')];
  const searchable = new Map(cards.map(card => [card, card.textContent.toLocaleLowerCase()]));
  let role = '';
  function filter() {
    const terms = search.value.toLocaleLowerCase().trim().split(/\\s+/).filter(Boolean);
    let visible = 0;
    for (const card of cards) {
      const matches = (!role || JSON.parse(card.dataset.roles).includes(role))
        && (!priority.value || card.dataset.priority === priority.value)
        && terms.every(term => searchable.get(card).includes(term));
      card.hidden = !matches;
      if (matches) visible++;
    }
    document.querySelector('#result-count').textContent = visible + ' of ' + cards.length + ' findings';
    document.querySelector('#empty').hidden = visible !== 0;
    roleButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.role === role)));
  }
  function reset() { role = ''; search.value = ''; priority.value = ''; filter(); }
  roleButtons.forEach(button => button.addEventListener('click', () => { role = button.dataset.role; filter(); }));
  search.addEventListener('input', filter);
  priority.addEventListener('change', filter);
  document.querySelector('#reset').addEventListener('click', reset);
  document.querySelector('#empty-reset').addEventListener('click', () => { reset(); search.focus(); });
  document.querySelector('#expand-all').addEventListener('click', () => cards.filter(card => !card.hidden).forEach(card => { card.open = true; }));
  document.querySelector('#collapse-all').addEventListener('click', () => cards.filter(card => !card.hidden).forEach(card => { card.open = false; }));
  document.querySelectorAll('[data-jump]').forEach(button => button.addEventListener('click', () => {
    const card = document.getElementById(button.dataset.jump);
    reset(); card.open = true; card.scrollIntoView({ block:'start' }); card.querySelector('summary').focus({ preventScroll:true });
  }));
  document.querySelector('#toolbar').hidden = false;
  document.querySelector('#tools-actions').hidden = false;
  filter();
  const allDetails = [...document.querySelectorAll('details')];
  window.addEventListener('beforeprint', () => allDetails.forEach(card => { card.dataset.wasOpen = String(card.open); card.open = true; }));
  window.addEventListener('afterprint', () => allDetails.forEach(card => { card.open = card.dataset.wasOpen === 'true'; }));
})();
</script>
</body>
</html>`;
await writeFile(output, html, "utf8");
console.log(`Rendered ${data.findings.length} findings to ${fileURLToPath(output)}`);
