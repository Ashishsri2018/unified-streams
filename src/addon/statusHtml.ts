export interface StatusPageOptions {
  addonName: string;
  logoUrl: string;
  configureUrl: string;
  scriptNonce: string;
}

export function getStatusCss(): string {
  return `:root {
  color-scheme: dark;
  --bg: #070b14;
  --panel: #101827;
  --line: #243044;
  --text: #e5edf8;
  --muted: #93a4bc;
  --accent: #60a5fa;
  --ok: #34d399;
  --warn: #fbbf24;
  --bad: #fb7185;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  color: var(--text);
  background: radial-gradient(900px 500px at 10% -10%, #1d2a5a55, transparent), var(--bg);
}
main { max-width: 1180px; margin: 0 auto; padding: 36px 20px 80px; }
header {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  margin-bottom: 24px;
}
.brand { display: flex; gap: 14px; align-items: center; }
.logo { width: 52px; height: 52px; border-radius: 15px; }
h1 { margin: 0; font-size: clamp(22px, 3vw, 30px); letter-spacing: -.03em; }
p { margin: 0; color: var(--muted); }
.badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: #0a121f;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .06em;
  font-size: 11px;
}
.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--muted); }
.ok .dot { background: var(--ok); box-shadow: 0 0 12px var(--ok); }
.degraded .dot { background: var(--warn); box-shadow: 0 0 12px var(--warn); }
.error .dot { background: var(--bad); box-shadow: 0 0 12px var(--bad); }
.ok { color: var(--ok); }
.degraded { color: var(--warn); }
.error { color: var(--bad); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin-bottom: 18px; }
.card {
  background: linear-gradient(180deg, #111b2bdd, #0c1422ee);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 14px 40px #0005;
}
.card .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
.card .value { margin-top: 8px; font-size: 25px; font-weight: 750; letter-spacing: -.03em; }
.card .sub { margin-top: 6px; color: var(--muted); font-size: 12px; }
.section {
  background: linear-gradient(180deg, #111b2bdd, #0c1422ee);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 20px;
  margin-top: 18px;
}
.section h2 { margin: 0 0 14px; font-size: 17px; }
.components { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
.component { border: 1px solid var(--line); border-radius: 14px; padding: 14px; background: #0a121f; }
.component-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.component-name { font-weight: 750; font-size: 15px; }
.component-meta {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px;
  color: var(--muted);
  font-size: 12px;
}
.component-meta strong { color: var(--text); font-weight: 600; }
.error-line { margin-top: 10px; padding: 8px 10px; border-radius: 8px; background: #3d1620; color: #fecdd3; font-size: 12px; word-break: break-word; }
.search-bar { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.search-input {
  background: #0a121f;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px 12px;
  font: inherit;
  color: var(--text);
  width: 100%;
  max-width: 320px;
  outline: none;
}
.search-input:focus { border-color: var(--accent); }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #1b2638; white-space: nowrap; }
th { color: var(--muted); font-weight: 650; position: sticky; top: 0; background: #0d1624; }
tr:hover td { background: #0e1828; }
.table-wrap { overflow: auto; max-height: 560px; border: 1px solid var(--line); border-radius: 12px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.muted { color: var(--muted); }
.actions { display: flex; gap: 10px; flex-wrap: wrap; }
button, .button {
  appearance: none;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 9px 14px;
  font: inherit;
  font-weight: 650;
  cursor: pointer;
  text-decoration: none;
  background: #162136;
  color: var(--text);
}
button:hover, .button:hover { border-color: #35507a; }
.footer { margin-top: 18px; color: var(--muted); font-size: 12px; }`;
}

export function getStatusScripts(): string {
  return `const overall = document.getElementById("overall");
const checked = document.getElementById("checked");
const summary = document.getElementById("summary");
const components = document.getElementById("components");
const providerRows = document.getElementById("provider-rows");
const providerCount = document.getElementById("provider-count");
const providerSearch = document.getElementById("provider-search");

let cachedStats = [];

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[ch]);
}
function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString() : "—";
}
function pct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return (n <= 1 ? n * 100 : n).toFixed(1) + "%";
}
function ms(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n).toLocaleString() + " ms" : "—";
}
function card(label, value, sub) {
  return '<div class="card"><div class="label">' + esc(label) + '</div><div class="value">' + esc(value) + '</div><div class="sub">' + esc(sub) + '</div></div>';
}
function statusClass(status) {
  return status === "ok" ? "ok" : status === "degraded" ? "degraded" : "error";
}

function renderTableRows() {
  const query = (providerSearch && providerSearch.value ? providerSearch.value.trim().toLowerCase() : "");
  const filtered = query
    ? cachedStats.filter((s) => (s.id && s.id.toLowerCase().includes(query)) || (s.component && s.component.toLowerCase().includes(query)))
    : cachedStats;

  providerCount.textContent = filtered.length + " of " + cachedStats.length + " provider circuits reporting";
  if (filtered.length === 0) {
    providerRows.innerHTML = '<tr><td colspan="11" class="muted">No matching providers found.</td></tr>';
    return;
  }
  providerRows.innerHTML = filtered.map((stat) => {
    const state = stat.state || "closed";
    const stateClass = state === "open" ? "error" : state === "half-open" ? "degraded" : "ok";
    return '<tr>' +
      '<td>' + esc(stat.component) + '</td>' +
      '<td class="mono">' + esc(stat.id) + '</td>' +
      '<td class="' + stateClass + '">' + esc(state) + '</td>' +
      '<td>' + num(stat.calls) + '</td>' +
      '<td>' + num(stat.ok) + '</td>' +
      '<td>' + num(stat.empty) + '</td>' +
      '<td>' + num(stat.errors) + '</td>' +
      '<td>' + num(stat.timeouts) + '</td>' +
      '<td>' + pct(stat.successRate) + '</td>' +
      '<td>' + ms(stat.avgMs) + '</td>' +
      '<td class="muted">' + esc(stat.lastError || "—") + '</td>' +
    '</tr>';
  }).join("");
}

function render(data) {
  const status = data.status || (data.ok ? "ok" : "error");
  overall.className = "badge " + statusClass(status);
  overall.innerHTML = '<span class="dot"></span><span>' + esc(status) + '</span>';
  checked.textContent = "Checked " + (data.checkedAt ? new Date(data.checkedAt).toLocaleString() : "now") + " · uptime " + num(data.uptimeSec) + "s";

  const streamCache = data.cache && data.cache.stream ? data.cache.stream : {};
  const comps = data.components || (data.fleets ? Object.entries(data.fleets).map(([key, val]) => ({
    name: key,
    displayName: key.toUpperCase(),
    ok: val && val.ok,
    latencyMs: val && val.latencyMs,
    health: val,
    process: { running: val && val.ok, uptimeSec: val && val.uptimeSec },
    error: val && val.error
  })) : []);

  cachedStats = (data.providers && Array.isArray(data.providers.stats)) ? data.providers.stats : [];
  if (cachedStats.length === 0 && data.fleets) {
    for (const [fleetKey, fleetVal] of Object.entries(data.fleets)) {
      if (fleetVal && fleetVal.providers && Array.isArray(fleetVal.providers.stats)) {
        for (const stat of fleetVal.providers.stats) {
          cachedStats.push(Object.assign({}, stat, { component: fleetKey }));
        }
      }
    }
  }

  const workingCount = comps.filter((c) => (c.status || (c.ok ? "ok" : "error")) === "ok").length;
  summary.innerHTML =
    card("Fleets", num(comps.length), workingCount + " of " + comps.length + " working") +
    card("Providers", num(data.providers && data.providers.total ? data.providers.total : cachedStats.length), cachedStats.length + " reporting") +
    card("Cache hits", num(streamCache.hits), num(streamCache.misses) + " misses · size " + num(streamCache.size)) +
    card("Requests", num(data.metrics && data.metrics.requests), num(data.metrics && data.metrics.emptyResults) + " empty results");

  components.innerHTML = comps.length === 0 ? '<p class="muted">No fleets enabled.</p>' : comps.map((component) => {
    const health = component.health || {};
    const process = component.process || {};
    const state = component.status || (component.ok ? (health.status || "ok") : "error");
    const stateLabel = state === "ok" ? "WORKING" : state === "degraded" ? "DEGRADED" : "OFFLINE";
    const updater = component.updater || (data.updater && data.updater[component.name]) || {};
    const updaterText = updater.lastError ? "Failed" : (updater.fetchedAt ? "Active" : "—");
    return '<div class="component ' + statusClass(state) + '">' +
      '<div class="component-head"><span class="component-name">' + esc(component.displayName || component.name) + '</span><span class="badge ' + statusClass(state) + '"><span class="dot"></span><span>' + esc(stateLabel) + '</span></span></div>' +
      '<div class="component-meta">' +
        '<span>Status <strong class="' + statusClass(state) + '">' + esc(stateLabel) + '</strong></span>' +
        '<span>Latency <strong>' + ms(component.latencyMs) + '</strong></span>' +
        '<span>Providers <strong>' + num(health.providers && health.providers.total) + '</strong></span>' +
        '<span>Circuits <strong>' + (health.providers && health.providers.circuits ? health.providers.circuits.open + " open" : "0 open") + '</strong></span>' +
        '<span>Process <strong>' + (process.running ? "running" : "stopped") + '</strong></span>' +
        '<span>Uptime <strong>' + num(process.uptimeSec) + 's</strong></span>' +
        '<span>Snapshot <strong>' + esc(health.snapshot && health.snapshot.sha ? String(health.snapshot.sha).slice(0, 8) : "—") + '</strong></span>' +
        '<span>Updater <strong class="' + (updater.lastError ? "error" : "muted") + '">' + esc(updaterText) + '</strong></span>' +
      '</div>' +
      (component.error ? '<div class="error-line">' + esc(component.error) + '</div>' : "") +
      (health.snapshot && health.snapshot.lastError && component.error !== health.snapshot.lastError ? '<div class="error-line">Snapshot: ' + esc(health.snapshot.lastError) + '</div>' : "") +
      (updater.lastError && component.error !== updater.lastError && (!component.error || !component.error.includes(updater.lastError)) ? '<div class="error-line">Updater: ' + esc(updater.lastError) + '</div>' : "") +
    '</div>';
  }).join("");

  renderTableRows();
}

async function refresh() {
  try {
    const response = await fetch("/health", { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    render(await response.json());
  } catch (error) {
    overall.className = "badge error";
    overall.innerHTML = '<span class="dot"></span><span>unreachable</span>';
    checked.textContent = "Health request failed: " + (error && error.message ? error.message : String(error));
  }
}

document.getElementById("refresh").addEventListener("click", refresh);
if (providerSearch) {
  providerSearch.addEventListener("input", renderTableRows);
}
refresh();
setInterval(refresh, 15000);`;
}

export function renderStatusPage(options: StatusPageOptions): string {
  const css = getStatusCss();
  const scripts = getStatusScripts();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${options.addonName} - Status</title>
<style>${css}</style>
</head>
<body>
<main>
  <header>
    <div class="brand">
      <img class="logo" src="${options.logoUrl}" alt="${options.addonName} Logo" />
      <div>
        <h1>${options.addonName} status</h1>
        <p id="checked">Loading health...</p>
      </div>
    </div>
    <div class="actions">
      <a class="button" href="${options.configureUrl}">Configure</a>
      <button type="button" id="refresh">Refresh</button>
    </div>
  </header>

  <div id="overall" class="badge"><span class="dot"></span><span>loading</span></div>

  <div class="grid" id="summary"></div>

  <section class="section">
    <h2>Fleets</h2>
    <div class="components" id="components"></div>
  </section>

  <section class="section">
    <h2>Providers</h2>
    <div class="search-bar">
      <input type="search" id="provider-search" class="search-input" placeholder="Filter providers (e.g. vega, anime, movie)..." />
      <span class="muted" id="provider-count"></span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Fleet</th><th>Provider</th><th>State</th><th>Calls</th><th>OK</th><th>Empty</th><th>Errors</th><th>Timeouts</th><th>Success</th><th>Avg ms</th><th>Last error</th></tr>
        </thead>
        <tbody id="provider-rows"></tbody>
      </table>
    </div>
  </section>

  <p class="footer">JSON: <a href="/health">/health</a> · <a href="/stats">/stats</a> · This page refreshes every 15 seconds.</p>
</main>
<script nonce="${options.scriptNonce}">${scripts}</script>
</body>
</html>`;
}
