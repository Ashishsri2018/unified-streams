import type { AdminRuntimeSettings } from './stream.js';
import { getStatusCss } from './statusHtml.js';

export interface AdminPageOptions {
  addonName: string;
  logoUrl: string;
  configureUrl: string;
  scriptNonce: string;
  settings: AdminRuntimeSettings | undefined;
  version: number;
  remoteBackupEnabled: boolean;
  manifestProxyEnabled?: boolean;
}

export interface AdminLoginOptions {
  addonName: string;
  logoUrl: string;
  scriptNonce: string;
  error?: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function baseCss(): string {
  return `${getStatusCss()}
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.section-head h2 { margin: 0; }
.provider-name { font-weight: 650; }
.provider-name .pill { margin-left: 6px; vertical-align: middle; }
.provider-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 2px; }
.provider-id, .provider-version { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: var(--muted); }
td.provider-cell { white-space: normal; min-width: 180px; }
.pill { display: inline-flex; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; border: 1px solid var(--line); white-space: nowrap; }
.on { color: #bbf7d0; border-color: #166534; background: #052e16; }
.off { color: #fecdd3; border-color: #7f1d1d; background: #2a0a10; }
.locked { color: #fde68a; border-color: #78350f; background: #2b1a05; }
.new { color: #bfdbfe; border-color: #1d4ed8; background: #0b1e3a; }
.updated { color: #ddd6fe; border-color: #6d28d9; background: #1e1035; }
.warn { color: #fecdd3; font-size: 12px; word-break: break-word; }
td.row-actions { text-align: right; white-space: nowrap; }
td.row-actions button { padding: 6px 12px; font-size: 12px; }
td.row-actions button + button { margin-left: 6px; }
td.row-actions button:disabled { opacity: .45; cursor: not-allowed; }
.settings { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
.setting { border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; background: #0a121f; }
.setting span { display: block; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
.setting strong { font-size: 14px; }
.login { max-width: 420px; margin: 12vh auto 0; }
.login input { width: 100%; margin: 12px 0; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); background: #0a121f; color: var(--text); font: inherit; }
.login button { width: 100%; }
.status { min-height: 20px; color: var(--muted); font-size: 12px; }
.empty { color: var(--muted); }`;
}

function pageShell(options: {
  title: string;
  logoUrl: string;
  addonName: string;
  nonce: string;
  body: string;
  scripts?: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${escapeHtml(options.addonName)} - ${escapeHtml(options.title)}</title>
<style nonce="${options.nonce}">${baseCss()}</style>
</head>
<body>
<main>
${options.body}
</main>
${options.scripts ? `<script nonce="${options.nonce}">${options.scripts}</script>` : ''}
</body>
</html>`;
}

export function renderAdminLoginPage(options: AdminLoginOptions): string {
  const error = options.error
    ? `<p class="error-line">${escapeHtml(options.error)}</p>`
    : '';
  return pageShell({
    title: 'Admin login',
    logoUrl: options.logoUrl,
    addonName: options.addonName,
    nonce: options.scriptNonce,
    body: `<header>
  <div class="brand">
    <img class="logo" src="${escapeHtml(options.logoUrl)}" alt="" />
    <div>
      <h1>Provider admin</h1>
      <p class="subtitle">Enter the configured ADMIN_TOKEN to manage providers.</p>
    </div>
  </div>
</header>
<section class="section login">
  ${error}
  <form method="post" action="/admin/login">
    <label for="token">Admin token</label>
    <input id="token" name="token" type="password" autocomplete="current-password" required autofocus />
    <button type="submit">Sign in</button>
  </form>
</section>`,
  });
}

export function renderAdminPage(options: AdminPageOptions): string {
  const settings = options.settings;
  const settingsHtml = settings
    ? `<div class="settings">
  <div class="setting"><span>Instance profile</span><strong>${escapeHtml(settings.instanceProfile)}</strong></div>
  <div class="setting"><span>Backend timeout</span><strong>${settings.backendTimeoutMs} ms</strong></div>
  <div class="setting"><span>Global deadline</span><strong>${settings.globalDeadlineMs} ms</strong></div>
  <div class="setting"><span>Search timeout</span><strong>${settings.searchTimeoutMs} ms</strong></div>
  <div class="setting"><span>Scraper concurrency</span><strong>${settings.scraperConcurrency}</strong></div>
  <div class="setting"><span>SA7 concurrency</span><strong>${settings.sa7Concurrency}</strong></div>
  <div class="setting"><span>Circuit threshold</span><strong>${settings.circuitFailureThreshold}</strong></div>
  <div class="setting"><span>Circuit cooldown</span><strong>${settings.circuitCooldownMs} ms</strong></div>
</div>
<p class="footer">Timeouts are deploy-time settings. Change and restart to apply.</p>`
    : '<p class="empty">Runtime settings unavailable.</p>';

  const scripts = `const providerRows = document.getElementById("provider-rows");
const statusLine = document.getElementById("status");
const versionLabel = document.getElementById("policy-version");
const searchInput = document.getElementById("search");
const duplicatesLine = document.getElementById("duplicates");
const countLabel = document.getElementById("provider-count");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[ch]);
}

function pill(kind, text) {
  return '<span class="pill ' + kind + '">' + esc(text) + '</span>';
}

function formatVersion(value) {
  const text = String(value || "");
  return text && !/^v/i.test(text) ? "v" + text : text;
}

function providerBadges(provider) {
  const badges = [];
  if (provider.isNew) badges.push(pill("new", "new"));
  if (provider.updated) {
    const from = formatVersion(provider.previousVersion);
    const to = formatVersion(provider.version);
    const detail = from && to ? " " + from + " \u2192 " + to : to ? " " + to : from ? " from " + from : "";
    badges.push(pill("updated", "updated" + detail));
  }
  if (provider.upstreamEnabled === false) {
    badges.push(pill(provider.adopted ? "updated" : "locked", provider.adopted ? "upstream disabled (adopted)" : "upstream disabled"));
  }
  return badges.join(" ");
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

function bytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "—";
  const mb = n / (1024 * 1024);
  return mb >= 1024 ? (mb / 1024).toFixed(2) + " GB" : mb.toFixed(1) + " MB";
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderMemory(health) {
  const memory = health && health.memory ? health.memory : null;
  setText("mem-rss", memory ? bytes(memory.rssBytes) : "—");
  setText("mem-peak", memory ? bytes(memory.peakRssBytes) : "—");
  setText("mem-heap-used", memory ? bytes(memory.heapUsedBytes) : "—");
  setText("mem-heap-total", memory ? bytes(memory.heapTotalBytes) : "—");
  setText("mem-heap-limit", memory ? bytes(memory.heapLimitBytes) : "—");
  setText("mem-external", memory ? bytes(memory.externalBytes) : "—");
  const system = memory && memory.system ? memory.system : null;
  setText("mem-sys-used", system ? bytes(system.usedBytes) : "—");
  setText("mem-sys-total", system ? bytes(system.totalBytes) : "—");
  setText("mem-sys-available", system ? bytes(system.availableBytes) : "—");
}

function statCell(stat, field, formatter) {
  return '<td>' + (stat ? formatter(stat[field]) : "—") + '</td>';
}

function collectStats(health, target) {
  function add(component, stat) {
    if (!stat || !stat.id) return;
    target.set(String(component) + ":" + String(stat.id).toLowerCase(), stat);
  }
  if (health && health.providers && Array.isArray(health.providers.stats)) {
    for (const stat of health.providers.stats) add(stat.component, stat);
  }
  if (health && health.fleets) {
    for (const [fleetKey, fleetVal] of Object.entries(health.fleets)) {
      if (fleetVal && fleetVal.providers && Array.isArray(fleetVal.providers.stats)) {
        for (const stat of fleetVal.providers.stats) add(fleetKey, stat);
      }
    }
  }
}

function setStatus(message, isError) {
  statusLine.textContent = message || "";
  statusLine.style.color = isError ? "var(--bad)" : "var(--muted)";
}

function applySearch() {
  const query = (searchInput.value || "").trim().toLowerCase();
  for (const row of providerRows.querySelectorAll("tr")) {
    if (!row.dataset.search) continue;
    row.hidden = query.length > 0 && !row.dataset.search.includes(query);
  }
}

function render(fleets, version, stats) {
  versionLabel.textContent = "policy v" + version;
  if (!Array.isArray(fleets) || fleets.length === 0) {
    providerRows.innerHTML = '<tr><td colspan="16" class="muted">No fleets responded.</td></tr>';
    countLabel.textContent = "";
    duplicatesLine.textContent = "";
    return;
  }
  const enabledCopies = new Map();
  for (const fleet of fleets) {
    for (const provider of (Array.isArray(fleet.providers) ? fleet.providers : [])) {
      if (!provider.enabled) continue;
      const key = String(provider.id || "").toLowerCase();
      enabledCopies.set(key, (enabledCopies.get(key) || 0) + 1);
    }
  }
  const duplicates = Array.from(enabledCopies.entries()).filter(([, count]) => count > 1).map(([id]) => id).sort();
  duplicatesLine.textContent = duplicates.length ? "Enabled in multiple fleets: " + duplicates.join(", ") : "";

  let added = 0;
  let removed = 0;
  let stateChanged = 0;
  for (const fleet of fleets) {
    const diff = fleet.reconciliation;
    if (!diff) continue;
    added += Array.isArray(diff.added) ? diff.added.length : 0;
    removed += Array.isArray(diff.removed) ? diff.removed.length : 0;
    stateChanged += Array.isArray(diff.stateChanged) ? diff.stateChanged.length : 0;
  }
  setText("reconcile", "Last upstream sync: +" + added + " added, -" + removed + " removed, " + stateChanged + " state changes");

  const rows = [];
  let total = 0;
  for (const fleet of fleets) {
    if (fleet.error) {
      rows.push('<tr><td colspan="16"><div class="error-line">' + esc(fleet.fleet + ": " + fleet.error) + '</div></td></tr>');
      continue;
    }
    const providers = Array.isArray(fleet.providers) ? fleet.providers : [];
    if (providers.length === 0) {
      rows.push('<tr><td colspan="16" class="muted">' + esc(fleet.fleet) + ' reported no providers.</td></tr>');
      continue;
    }
    for (const provider of providers) {
      total += 1;
      const stat = stats.get(String(fleet.fleet) + ":" + String(provider.id).toLowerCase());
      const loaded = provider.loaded ? pill("on", "loaded") : pill("off", "unloaded");
      const selection = provider.enabled ? pill("on", "on") : pill("off", "off");
      const locked = provider.locked ? ' <span class="pill locked" title="Hard-disabled by policy">&#128274;</span>' : "";
      const missing = provider.missing ? " " + pill("locked", "missing") : "";
      const error = provider.lastError ? '<div class="warn">' + esc(provider.lastError) + '</div>' : '';
      const enableBlocked = provider.upstreamEnabled === false && !provider.adopted;
      const actionDisabled = provider.locked || (!provider.enabled && enableBlocked) ? " disabled" : "";
      const resetDisabled = provider.locked ? " disabled" : "";
      const nameMatchesId = String(provider.name || "").toLowerCase() === String(provider.id || "").toLowerCase();
      const badges = providerBadges(provider);
      const meta = [];
      if (!nameMatchesId) meta.push('<span class="provider-id">' + esc(provider.id) + '</span>');
      if (provider.version) meta.push('<span class="provider-version">' + esc(formatVersion(provider.version)) + '</span>');
      const metaLine = meta.length ? '<div class="provider-meta">' + meta.join(" ") + '</div>' : "";
      const state = stat ? (stat.state || "closed") : "";
      const stateClass = state === "open" ? "error" : state === "half-open" ? "degraded" : "ok";
      const stateCell = stat ? '<td class="' + stateClass + '">' + esc(state) + '</td>' : '<td class="muted">—</td>';
      const action = provider.enabled
        ? '<button type="button" data-fleet="' + esc(fleet.fleet) + '" data-id="' + esc(provider.id) + '" data-enabled="false"' + actionDisabled + '>Disable</button>'
        : '<button type="button" data-fleet="' + esc(fleet.fleet) + '" data-id="' + esc(provider.id) + '" data-enabled="true"' + actionDisabled + '>Enable</button>';
      const reset = '<button type="button" data-fleet="' + esc(fleet.fleet) + '" data-id="' + esc(provider.id) + '" data-enabled="reset"' + resetDisabled + '>Reset</button>';
      rows.push('<tr data-search="' + esc((fleet.fleet + " " + provider.id + " " + provider.name).toLowerCase()) + '">'
        + '<td class="mono">' + esc(fleet.fleet) + '</td>'
        + '<td class="provider-cell"><div class="provider-name">' + esc(provider.name) + (badges ? " " + badges : "") + '</div>' + metaLine + error + '</td>'
        + '<td>' + esc((provider.types || []).join(", ")) + '</td>'
        + '<td>' + selection + locked + missing + '</td>'
        + '<td>' + loaded + '</td>'
        + stateCell
        + statCell(stat, "calls", num)
        + statCell(stat, "ok", num)
        + statCell(stat, "empty", num)
        + statCell(stat, "errors", num)
        + statCell(stat, "timeouts", num)
        + statCell(stat, "responseRate", pct)
        + statCell(stat, "yieldRate", pct)
        + statCell(stat, "avgMs", ms)
        + '<td class="muted">' + esc((stat && stat.lastError) || "—") + '</td>'
        + '<td class="row-actions">' + action + reset + '</td>'
        + '</tr>');
    }
  }
  providerRows.innerHTML = rows.join("");
  countLabel.textContent = total + (total === 1 ? " provider" : " providers");
  applySearch();
}

async function load() {
  setStatus("Loading catalog...");
  try {
    const [response, healthResponse] = await Promise.all([
      fetch("/admin/api/catalog", { cache: "no-store" }),
      fetch("/health", { cache: "no-store" }).catch(() => null)
    ]);
    const data = await response.json();
    if (response.status === 401) { window.location.href = "/admin"; return; }
    if (!response.ok) throw new Error(data && data.error ? data.error : "HTTP " + response.status);
    const stats = new Map();
    let health = null;
    if (healthResponse && healthResponse.ok) {
      try {
        health = await healthResponse.json();
        collectStats(health, stats);
      } catch {}
    }
    render(data.fleets, data.version, stats);
    renderMemory(health);
    setStatus("Loaded.");
  } catch (error) {
    setStatus("Catalog request failed: " + (error && error.message ? error.message : String(error)), true);
  }
}

async function toggle(fleet, id, enabled) {
  setStatus((enabled === "reset" ? "Resetting " : enabled ? "Enabling " : "Disabling ") + id + "...");
  try {
    const response = await fetch("/admin/api/providers/toggle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fleet, id, enabled: enabled === "reset" ? null : enabled === "true" })
    });
    const data = await response.json();
    if (response.status === 401) { window.location.href = "/admin"; return; }
    if (!response.ok || !data.ok) throw new Error(data && data.error ? data.error : "HTTP " + response.status);
    setStatus("Updated " + id + ".");
    await load();
  } catch (error) {
    setStatus("Update failed: " + (error && error.message ? error.message : String(error)), true);
  }
}

providerRows.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-fleet]");
  if (!button || button.disabled) return;
  void toggle(button.dataset.fleet, button.dataset.id, button.dataset.enabled);
});

searchInput.addEventListener("input", applySearch);
async function saveToCloudflare() {
  const button = document.getElementById("save-remote");
  setStatus("Saving overrides to Cloudflare...");
  if (button) button.disabled = true;
  try {
    const response = await fetch("/admin/api/providers/save", { method: "POST" });
    const data = await response.json();
    if (response.status === 401) { window.location.href = "/admin"; return; }
    if (!response.ok || !data.ok) throw new Error(data && data.error ? data.error : "HTTP " + response.status);
    setStatus("Saved to Cloudflare (remote v" + data.remoteVersion + ").");
  } catch (error) {
    setStatus("Cloudflare save failed: " + (error && error.message ? error.message : String(error)), true);
  } finally {
    if (button) button.disabled = false;
  }
}

document.getElementById("refresh").addEventListener("click", () => void load());
document.getElementById("save-remote").addEventListener("click", () => void saveToCloudflare());
document.getElementById("logout").addEventListener("click", async () => {
  await fetch("/admin/logout", { method: "POST" });
  window.location.href = "/admin";
});

const proxyRows = document.getElementById("proxy-rows");
const proxyMatch = document.getElementById("proxy-match");
const proxyReferer = document.getElementById("proxy-referer");
const proxyOrigin = document.getElementById("proxy-origin");
const proxyUserAgent = document.getElementById("proxy-ua");

function renderProxy(data) {
  if (!proxyRows) return;
  const entries = data && Array.isArray(data.entries) ? data.entries : [];
  setText("proxy-version", data && data.version !== undefined ? "config v" + data.version : "");
  if (entries.length === 0) {
    proxyRows.innerHTML = '<tr><td colspan="5" class="muted">No manifest proxy entries.</td></tr>';
    return;
  }
  proxyRows.innerHTML = entries.map((entry) => {
    const headers = Object.entries(entry.headers || {}).map(([key, value]) => key + ": " + value).join(" · ");
    const state = entry.enabled ? pill("on", "on") : pill("off", "off");
    return '<tr>'
      + '<td class="mono">' + esc(entry.match) + '</td>'
      + '<td>' + esc(entry.mode) + '</td>'
      + '<td class="muted">' + esc(headers || "—") + '</td>'
      + '<td>' + state + '</td>'
      + '<td class="row-actions">'
      + '<button type="button" data-proxy-toggle="' + esc(entry.id) + '" data-enabled="' + (entry.enabled ? "false" : "true") + '">' + (entry.enabled ? "Disable" : "Enable") + '</button>'
      + '<button type="button" data-proxy-remove="' + esc(entry.id) + '">Remove</button>'
      + '</td></tr>';
  }).join("");
}

async function loadProxy() {
  if (!proxyRows) return;
  try {
    const response = await fetch("/admin/api/manifest-proxy", { cache: "no-store" });
    if (response.status === 401) { window.location.href = "/admin"; return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data && data.error ? data.error : "HTTP " + response.status);
    renderProxy(data);
  } catch (error) {
    proxyRows.innerHTML = '<tr><td colspan="5" class="muted">' + esc(error && error.message ? error.message : String(error)) + '</td></tr>';
  }
}

async function proxyAction(path, body) {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (response.status === 401) { window.location.href = "/admin"; return; }
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data && data.error ? data.error : "HTTP " + response.status);
    renderProxy(data);
    setStatus("Manifest proxy updated.");
  } catch (error) {
    setStatus("Manifest proxy update failed: " + (error && error.message ? error.message : String(error)), true);
  }
}

if (proxyRows) {
  proxyRows.addEventListener("click", (event) => {
    const toggleButton = event.target.closest("button[data-proxy-toggle]");
    if (toggleButton) {
      void proxyAction("/admin/api/manifest-proxy/toggle", {
        id: toggleButton.dataset.proxyToggle,
        enabled: toggleButton.dataset.enabled === "true"
      });
      return;
    }
    const removeButton = event.target.closest("button[data-proxy-remove]");
    if (removeButton) {
      void proxyAction("/admin/api/manifest-proxy/remove", { id: removeButton.dataset.proxyRemove });
    }
  });
}

const proxyAddButton = document.getElementById("proxy-add");
if (proxyAddButton) {
  proxyAddButton.addEventListener("click", () => {
    const match = (proxyMatch.value || "").trim();
    if (!match) { setStatus("Manifest proxy URL is required.", true); return; }
    const headers = {};
    const referer = (proxyReferer.value || "").trim();
    const origin = (proxyOrigin.value || "").trim();
    const userAgent = (proxyUserAgent.value || "").trim();
    if (referer) headers.Referer = referer;
    if (origin) headers.Origin = origin;
    if (userAgent) headers["User-Agent"] = userAgent;
    void proxyAction("/admin/api/manifest-proxy/add", { match, headers });
    proxyMatch.value = "";
    proxyReferer.value = "";
    proxyOrigin.value = "";
    proxyUserAgent.value = "";
  });
}

loadProxy();

load();
setInterval(load, 30000);`;

  return pageShell({
    title: 'Provider admin',
    logoUrl: options.logoUrl,
    addonName: options.addonName,
    nonce: options.scriptNonce,
    body: `<header>
  <div class="brand">
    <img class="logo" src="${escapeHtml(options.logoUrl)}" alt="" />
    <div>
      <h1>Provider admin</h1>
      <p class="subtitle">Runtime enable/disable across fleets. Changes persist and apply without a restart.</p>
    </div>
  </div>
  <div class="actions">
    <span class="badge"><span class="dot"></span><span id="policy-version">policy v${options.version}</span></span>
    <a class="button" href="${escapeHtml(options.configureUrl)}">Configure</a>
    <button type="button" id="refresh">Refresh</button>
    <button type="button" id="save-remote"${options.remoteBackupEnabled ? '' : ' disabled title="Set CLOUDFLARE_SETTINGS_ENDPOINT to enable remote backup"'}>Save to Cloudflare</button>
    <button type="button" id="logout">Sign out</button>
  </div>
</header>
<section class="section">
  <div class="section-head">
    <h2>Providers</h2>
    <span class="muted" id="provider-count"></span>
  </div>
  <div class="search-bar">
    <input id="search" class="search-input" type="search" placeholder="Filter providers (e.g. vega, anime, movie)..." aria-label="Filter providers" />
    <span class="status" id="status"></span>
    <span class="status" id="duplicates"></span>
    <span class="status" id="reconcile"></span>
  </div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Fleet</th><th>Provider</th><th>Types</th><th>Selection</th><th>Bundle</th><th>State</th><th>Calls</th><th>OK</th><th>Empty</th><th>Errors</th><th>Timeouts</th><th>Response</th><th>Yield</th><th>Avg ms</th><th>Last error</th><th>Actions</th></tr>
      </thead>
      <tbody id="provider-rows"><tr><td colspan="16" class="muted">Loading provider catalog...</td></tr></tbody>
    </table>
  </div>
</section>
${options.manifestProxyEnabled ? `<section class="section">
  <div class="section-head"><h2>Manifest proxy</h2><span class="muted" id="proxy-version"></span></div>
  <p class="muted">Manifest mode proxies only .m3u8 playlists. Media segments load directly from the upstream CDN.</p>
  <div class="table-wrap">
    <table>
      <thead><tr><th>URL prefix</th><th>Mode</th><th>Headers</th><th>State</th><th>Actions</th></tr></thead>
      <tbody id="proxy-rows"><tr><td colspan="5" class="muted">Loading manifest proxy entries...</td></tr></tbody>
    </table>
  </div>
  <div class="search-bar">
    <input id="proxy-match" class="search-input" type="url" placeholder="https://moon.goldenkite.top/" aria-label="Manifest proxy URL prefix" />
    <input id="proxy-referer" class="search-input" type="text" placeholder="Referer (optional)" aria-label="Referer header" />
    <input id="proxy-origin" class="search-input" type="text" placeholder="Origin (optional)" aria-label="Origin header" />
    <input id="proxy-ua" class="search-input" type="text" placeholder="User-Agent (optional)" aria-label="User-Agent header" />
    <button type="button" id="proxy-add">Add</button>
  </div>
</section>` : ''}
<section class="section">
  <div class="section-head"><h2>Runtime settings</h2><span class="muted">read-only</span></div>
  ${settingsHtml}
</section>
<section class="section">
  <div class="section-head"><h2>Process memory</h2><span class="muted">gateway + fleets</span></div>
  <div class="settings">
    <div class="setting"><span>RSS now</span><strong id="mem-rss">—</strong></div>
    <div class="setting"><span>Peak RSS</span><strong id="mem-peak">—</strong></div>
    <div class="setting"><span>Heap used</span><strong id="mem-heap-used">—</strong></div>
    <div class="setting"><span>Heap total</span><strong id="mem-heap-total">—</strong></div>
    <div class="setting"><span>Heap limit</span><strong id="mem-heap-limit">—</strong></div>
    <div class="setting"><span>External</span><strong id="mem-external">—</strong></div>
    <div class="setting"><span>System used</span><strong id="mem-sys-used">—</strong></div>
    <div class="setting"><span>System total</span><strong id="mem-sys-total">—</strong></div>
    <div class="setting"><span>System available</span><strong id="mem-sys-available">—</strong></div>
  </div>
</section>
<p class="footer">Locked providers are hard-disabled by policy. Providers disabled upstream stay inactive unless listed in <code>adoptUpstreamDisabled</code>. Overrides are stored in DATA_DIR/provider-overrides.json. Use Save to Cloudflare to restore them after a deploy on hosts without a persistent disk; remote settings take precedence when present at startup.</p>`,
    scripts,
  });
}
