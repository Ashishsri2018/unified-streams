export interface ProvidersPageOptions {
  addonName: string;
  logoUrl: string;
  configureUrl: string;
  scriptNonce: string;
}

export function getProvidersCss(): string {
  return `:root {
  color-scheme: dark;
  --bg: #070b14;
  --panel: #101827;
  --line: #243044;
  --text: #e5edf8;
  --muted: #93a4bc;
  --accent: #60a5fa;
  --ok: #34d399;
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
main { max-width: 900px; margin: 0 auto; padding: 40px 20px 80px; }
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
.subtitle { margin-top: 4px; font-size: 13px; }
.badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: #0a121f;
  font-weight: 700;
  letter-spacing: .04em;
  font-size: 12px;
}
.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 12px var(--ok); }
.section {
  background: linear-gradient(180deg, #111b2bdd, #0c1422ee);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 20px;
  box-shadow: 0 14px 40px #0005;
}
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.section h2 { margin: 0; font-size: 17px; }
.chips { display: flex; flex-wrap: wrap; gap: 10px; }
.provider {
  display: inline-flex;
  align-items: center;
  padding: 8px 13px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #0a121f;
  color: var(--text);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  font-weight: 600;
}
.empty { color: var(--muted); }
.error-line {
  padding: 10px 12px;
  border-radius: 10px;
  background: #3d1620;
  color: #fecdd3;
  font-size: 13px;
}
.actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
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

export function getProvidersScripts(): string {
  return `const list = document.getElementById("providers-list");
const count = document.getElementById("providers-count");
const updated = document.getElementById("providers-updated");
const refreshButton = document.getElementById("providers-refresh");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[ch]);
}

function isWorking(stat) {
  if (!stat) return false;
  if (String(stat.state || "closed") === "open") return false;
  const ok = Number(stat.ok) || 0;
  const empty = Number(stat.empty) || 0;
  const responded = Number.isFinite(Number(stat.responded))
    ? Number(stat.responded)
    : ok - empty;
  return responded > 0;
}

function render(data) {
  const stats = data && data.providers && Array.isArray(data.providers.stats) ? data.providers.stats : [];
  const seen = new Map();
  for (const stat of stats) {
    if (!isWorking(stat)) continue;
    const id = String(stat.id || "").trim();
    if (!id) continue;
    const key = id.toLowerCase();
    if (!seen.has(key)) seen.set(key, id);
  }
  const names = Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  count.textContent = names.length + (names.length === 1 ? " provider" : " providers");
  if (names.length === 0) {
    list.innerHTML = '<p class="empty">No working providers observed yet. Play something in Stremio to populate this list.</p>';
  } else {
    list.innerHTML = names.map((name) => '<span class="provider">' + esc(name) + '</span>').join("");
  }
  const checkedAt = data && data.checkedAt ? new Date(data.checkedAt) : new Date();
  updated.textContent = "Checked " + checkedAt.toLocaleTimeString() + " · refreshes every 15 seconds";
}

async function refresh() {
  try {
    const response = await fetch("/health", { cache: "no-store" });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("HTTP " + response.status + " (invalid JSON)");
    }
    if (!data || typeof data !== "object") {
      throw new Error("HTTP " + response.status + " (invalid payload)");
    }
    render(data);
  } catch (error) {
    count.textContent = "—";
    updated.textContent = "Health request failed: " + (error && error.message ? error.message : String(error));
    list.innerHTML = '<p class="error-line">Could not load providers.</p>';
  }
}

refreshButton.addEventListener("click", refresh);
refresh();
setInterval(refresh, 15000);`;
}

export function renderProvidersPage(options: ProvidersPageOptions): string {
  const css = getProvidersCss();
  const scripts = getProvidersScripts();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${options.addonName} - Working providers</title>
<style nonce="${options.scriptNonce}">${css}</style>
</head>
<body>
<main>
  <header>
    <div class="brand">
      <img class="logo" src="${options.logoUrl}" alt="${options.addonName} Logo" />
      <div>
        <h1>Working providers</h1>
        <p class="subtitle">Providers that returned at least one stream since the addon started.</p>
      </div>
    </div>
    <div class="actions">
      <a class="button" href="${options.configureUrl}">Configure</a>
      <button type="button" id="providers-refresh">Refresh</button>
    </div>
  </header>

  <section class="section">
    <div class="section-head">
      <h2 id="providers-count">Loading...</h2>
      <span class="badge"><span class="dot"></span><span id="providers-updated">Loading health...</span></span>
    </div>
    <div class="chips" id="providers-list"></div>
  </section>

  <p class="footer">JSON: <a href="/health">/health</a> · This page refreshes every 15 seconds.</p>
</main>
<script nonce="${options.scriptNonce}">${scripts}</script>
</body>
</html>`;
}
