import type { AdminRuntimeSettings } from './stream.js';
import { getProvidersCss } from './providersHtml.js';

export interface AdminPageOptions {
  addonName: string;
  logoUrl: string;
  configureUrl: string;
  scriptNonce: string;
  settings: AdminRuntimeSettings | undefined;
  version: number;
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
  return `${getProvidersCss()}
.toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 18px; }
.toolbar input { padding: 9px 12px; border-radius: 10px; border: 1px solid var(--line); background: #0a121f; color: var(--text); font: inherit; min-width: 220px; }
.fleet { margin-bottom: 18px; }
.fleet h2 { margin: 0; font-size: 16px; text-transform: uppercase; letter-spacing: .12em; }
.fleet-meta { color: var(--muted); font-size: 12px; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; border-bottom: 1px solid var(--line); padding: 9px 8px; vertical-align: middle; }
th { color: var(--muted); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
.provider-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--muted); }
.pill { display: inline-flex; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; border: 1px solid var(--line); }
.on { color: #bbf7d0; border-color: #166534; background: #052e16; }
.off { color: #fecdd3; border-color: #7f1d1d; background: #2a0a10; }
.locked { color: #fde68a; border-color: #78350f; background: #2b1a05; }
.warn { color: #fecdd3; font-size: 12px; }
.settings { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
.setting { border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; background: #0a121f; }
.setting span { display: block; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
.setting strong { font-size: 14px; }
.login { max-width: 420px; margin: 12vh auto 0; }
.login input { width: 100%; margin: 12px 0; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); background: #0a121f; color: var(--text); font: inherit; }
.login button { width: 100%; }
.status { min-height: 20px; color: var(--muted); font-size: 12px; }`;
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

  const scripts = `const fleetRoot = document.getElementById("fleets");
const statusLine = document.getElementById("status");
const versionLabel = document.getElementById("policy-version");
const searchInput = document.getElementById("search");
const duplicatesLine = document.getElementById("duplicates");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[ch]);
}

function setStatus(message, isError) {
  statusLine.textContent = message || "";
  statusLine.style.color = isError ? "var(--bad)" : "var(--muted)";
}

function applySearch() {
  const query = (searchInput.value || "").trim().toLowerCase();
  for (const row of fleetRoot.querySelectorAll("tbody tr")) {
    row.hidden = query.length > 0 && !String(row.dataset.search || "").includes(query);
  }
}

function render(fleets, version) {
  versionLabel.textContent = "policy v" + version;
  if (!Array.isArray(fleets) || fleets.length === 0) {
    fleetRoot.innerHTML = '<p class="empty">No fleets responded.</p>';
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
  fleetRoot.innerHTML = fleets.map((fleet) => {
    const providers = Array.isArray(fleet.providers) ? fleet.providers : [];
    const rows = providers.map((provider) => {
      const loaded = provider.loaded ? '<span class="pill on">loaded</span>' : '<span class="pill off">unloaded</span>';
      const enabled = provider.enabled ? '<span class="pill on">on</span>' : '<span class="pill off">off</span>';
      const locked = provider.locked ? ' <span class="pill locked">locked</span>' : '';
      const missing = provider.missing ? ' <span class="pill locked">missing</span>' : '';
      const error = provider.lastError ? '<div class="warn">' + esc(provider.lastError) + '</div>' : '';
      const disabled = provider.locked ? " disabled" : "";
      return '<tr data-search="' + esc((provider.id + " " + provider.name).toLowerCase()) + '">'
        + '<td><div>' + esc(provider.name) + '</div><div class="provider-id">' + esc(provider.id) + '</div>' + error + '</td>'
        + '<td>' + esc((provider.types || []).join(", ")) + '</td>'
        + '<td>' + enabled + locked + missing + '</td>'
        + '<td>' + loaded + '</td>'
        + '<td><button data-fleet="' + esc(fleet.fleet) + '" data-id="' + esc(provider.id) + '" data-enabled="true"' + disabled + '>Enable</button> '
        + '<button data-fleet="' + esc(fleet.fleet) + '" data-id="' + esc(provider.id) + '" data-enabled="false"' + disabled + '>Disable</button> '
        + '<button data-fleet="' + esc(fleet.fleet) + '" data-id="' + esc(provider.id) + '" data-enabled="reset"' + disabled + '>Reset</button></td>'
        + '</tr>';
    }).join("");
    const error = fleet.error ? '<p class="error-line">' + esc(fleet.error) + '</p>' : "";
    return '<section class="section fleet"><div class="section-head"><h2>' + esc(fleet.fleet) + '</h2>'
      + '<span class="fleet-meta">version ' + esc(fleet.version) + '</span></div>'
      + error
      + (rows ? '<table><thead><tr><th>Provider</th><th>Types</th><th>Selection</th><th>Bundle</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table>' : '<p class="empty">No providers reported.</p>')
      + '</section>';
  }).join("");
  applySearch();
}

async function load() {
  setStatus("Loading catalog...");
  try {
    const response = await fetch("/admin/api/catalog", { cache: "no-store" });
    const data = await response.json();
    if (response.status === 401) { window.location.href = "/admin"; return; }
    if (!response.ok) throw new Error(data && data.error ? data.error : "HTTP " + response.status);
    render(data.fleets, data.version);
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

fleetRoot.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-fleet]");
  if (!button || button.disabled) return;
  void toggle(button.dataset.fleet, button.dataset.id, button.dataset.enabled);
});

searchInput.addEventListener("input", applySearch);
document.getElementById("refresh").addEventListener("click", () => void load());
document.getElementById("logout").addEventListener("click", async () => {
  await fetch("/admin/logout", { method: "POST" });
  window.location.href = "/admin";
});

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
    <button type="button" id="logout">Sign out</button>
  </div>
</header>
<div class="toolbar">
  <input id="search" type="search" placeholder="Filter providers" aria-label="Filter providers" />
  <span class="status" id="status"></span>
  <span class="status" id="duplicates"></span>
</div>
<div id="fleets"><section class="section"><p class="empty">Loading provider catalog...</p></section></div>
<section class="section fleet">
  <div class="section-head"><h2>Runtime settings</h2><span class="fleet-meta">read-only</span></div>
  ${settingsHtml}
</section>
<p class="footer">Locked providers are hard-disabled by policy. Overrides are stored in DATA_DIR/provider-overrides.json.</p>`,
    scripts,
  });
}
