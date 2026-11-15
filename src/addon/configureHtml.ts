/**
 * Server-rendered HTML and client JS for the Unified Streams /configure page.
 */

export function renderConfigurePageHtml(
  baseUrl: string,
  prefillConfigJson: string,
  scriptNonce: string,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#070b14">
  <title>Unified Streams — Configure</title>
  <link rel="icon" type="image/x-icon" href="${baseUrl}/favicon.ico">
  <style>
    :root {
      color-scheme: dark;
      --bg: #070b14;
      --panel: #101827;
      --panel-deep: #0a121f;
      --line: #243044;
      --text: #e5edf8;
      --muted: #93a4bc;
      --accent: #60a5fa;
      --accent-strong: #3b82f6;
      --ok: #34d399;
      --warn: #fbbf24;
      --bad: #fb7185;
      --radius: 16px;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      min-height: 100vh;
      font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: var(--text);
      background:
        radial-gradient(900px 480px at 8% -10%, #1d2a5a66, transparent),
        radial-gradient(700px 420px at 100% 0%, #0f2a3a55, transparent),
        var(--bg);
    }
    a { color: var(--accent); }
    .container { max-width: 860px; margin: 0 auto; padding: 28px 18px 64px; }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 22px;
    }
    .brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .logo { width: 56px; height: 56px; border-radius: 16px; flex: none; }
    h1 { margin: 0; font-size: clamp(22px, 3vw, 28px); letter-spacing: -0.03em; }
    .subtitle { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
    .card {
      background: linear-gradient(180deg, #111b2bdd, #0c1422ee);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 20px;
      margin-bottom: 16px;
      box-shadow: 0 14px 40px #0005;
    }
    .card-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 16px;
    }
    h2 { margin: 0; font-size: 17px; letter-spacing: -0.01em; }
    .card-sub { margin: 3px 0 0; color: var(--muted); font-size: 12.5px; }
    .step {
      flex: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 30px;
      height: 30px;
      padding: 0 8px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--panel-deep);
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
    }
    fieldset { border: 0; margin: 0; padding: 0; }
    fieldset + fieldset { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--line); }
    legend, .label {
      display: block;
      margin-bottom: 8px;
      color: var(--text);
      font-size: 13px;
      font-weight: 650;
    }
    .field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .field-help { margin: 6px 0 0; color: var(--muted); font-size: 12px; }
    select, input[type="number"], input[type="text"] {
      width: 100%;
      min-height: 42px;
      padding: 9px 11px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--panel-deep);
      color: var(--text);
      font: inherit;
      outline: none;
    }
    .chip-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .chip {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--panel-deep);
      color: var(--muted);
      font-size: 11.5px;
      font-weight: 500;
      cursor: pointer;
      user-select: none;
      min-height: unset;
    }
    .chip:hover { border-color: var(--accent); color: var(--text); }
    select:focus-visible, input:focus-visible, input[type="checkbox"]:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    .check {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-top: 10px;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--panel-deep);
      color: var(--muted);
      font-size: 13px;
      cursor: pointer;
    }
    .check input { margin: 3px 0 0; accent-color: var(--accent); flex: none; }
    .check.disabled { opacity: 0.55; cursor: not-allowed; }
    .fleets { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
    .fleet {
      display: flex;
      align-items: flex-start;
      gap: 11px;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--panel-deep);
      cursor: pointer;
      transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
    }
    .fleet:hover { border-color: #35507a; }
    .fleet.selected {
      border-color: var(--accent);
      background: linear-gradient(180deg, #172554aa, #0a121fee);
    }
    .fleet input { margin: 3px 0 0; accent-color: var(--accent); flex: none; }
    .fleet-name { display: block; font-weight: 700; color: var(--text); }
    .fleet-desc { display: block; margin-top: 2px; color: var(--muted); font-size: 12px; }
    .summary { list-style: none; margin: 0 0 16px; padding: 0; display: grid; gap: 8px; }
    .summary li {
      display: flex;
      align-items: flex-start;
      gap: 9px;
      color: var(--muted);
      font-size: 13px;
    }
    .summary li::before {
      content: "";
      flex: none;
      width: 7px;
      height: 7px;
      margin-top: 7px;
      border-radius: 50%;
      background: var(--accent);
    }
    .summary strong { color: var(--text); font-weight: 650; }
    .url-box {
      min-height: 46px;
      padding: 11px 12px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--panel-deep);
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12.5px;
      line-height: 1.65;
      word-break: break-all;
    }
    .error {
      margin: 0 0 14px;
      padding: 10px 12px;
      border: 1px solid #7f1d3a;
      border-radius: 10px;
      background: #3d1620;
      color: #fecdd3;
      font-size: 13px;
    }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
    button, .button {
      appearance: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 42px;
      padding: 9px 15px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #162136;
      color: var(--text);
      font: inherit;
      font-weight: 650;
      text-decoration: none;
      cursor: pointer;
    }
    button:hover:not(:disabled), .button:hover { border-color: #35507a; }
    button:focus-visible, .button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .btn-primary {
      flex: 1 1 200px;
      border-color: transparent;
      background: linear-gradient(135deg, var(--accent), var(--accent-strong));
      color: #04101f;
    }
    .btn-primary:hover:not(:disabled) { filter: brightness(1.08); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .status-text { min-height: 18px; margin: 10px 0 0; color: var(--ok); font-size: 12.5px; }
    .note {
      margin-top: 14px;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--panel-deep);
      color: var(--muted);
      font-size: 12.5px;
    }
    .footer { margin-top: 18px; color: var(--muted); font-size: 12px; text-align: center; }
    @media (max-width: 620px) {
      .container { padding: 20px 14px 48px; }
      .field-grid { grid-template-columns: 1fr; }
      .card { padding: 17px; }
      .header-actions .button { width: 100%; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      .fleet { transition: none; }
    }
  </style>
</head>
<body>
  <main class="container">
    <header class="header">
      <div class="brand">
        <img class="logo" src="${baseUrl}/logo.png" alt="">
        <div>
          <h1>Unified Streams</h1>
          <p class="subtitle">Build a Stremio install link for SA7, Nuvio, and Vega streams.</p>
        </div>
      </div>
      <div class="header-actions">
        <a class="button" href="${baseUrl}/status">View status</a>
      </div>
    </header>

    <noscript>
      <div class="card"><p class="card-sub">JavaScript is required to build and copy the install link.</p></div>
    </noscript>

    <section class="card" aria-labelledby="filters-heading">
      <div class="card-head">
        <div>
          <h2 id="filters-heading">Stream filters</h2>
          <p class="card-sub">Optional limits. Leave a field blank to keep every stream for that rule.</p>
        </div>
        <span class="step" aria-hidden="true">01</span>
      </div>

      <fieldset>
        <legend>Resolution</legend>
        <div class="field-grid">
          <div class="field">
            <label for="minRes">Minimum</label>
            <select id="minRes">
              <option value="">Any</option>
              <option value="240">240p</option>
              <option value="360">360p</option>
              <option value="480">480p</option>
              <option value="576">576p</option>
              <option value="720">720p</option>
              <option value="1080">1080p</option>
              <option value="1440">1440p (2K)</option>
              <option value="2160">2160p (4K)</option>
              <option value="4320">4320p (8K)</option>
            </select>
          </div>
          <div class="field">
            <label for="maxRes">Maximum</label>
            <select id="maxRes">
              <option value="">Any</option>
              <option value="480">480p</option>
              <option value="576">576p</option>
              <option value="720">720p</option>
              <option value="1080">1080p</option>
              <option value="1440">1440p (2K)</option>
              <option value="2160">2160p (4K)</option>
              <option value="4320">4320p (8K)</option>
            </select>
          </div>
        </div>
        <p class="field-help">A 720p maximum keeps 720p and lower, and excludes 1080p and above. Set both fields to the same value to allow one resolution only.</p>
        <label class="check" id="unknownResCheck">
          <input type="checkbox" id="includeUnknownRes" checked>
          <span>Include streams when the resolution cannot be detected</span>
        </label>
      </fieldset>

      <fieldset>
        <legend>File size</legend>
        <div class="field">
          <label for="maxSizeGB">Maximum size (GB)</label>
          <input type="number" id="maxSizeGB" step="0.1" min="0.1" max="1024" inputmode="decimal" placeholder="No limit">
        </div>
        <label class="check" id="unknownSizeCheck">
          <input type="checkbox" id="includeUnknownSize" checked>
          <span>Include streams when the file size cannot be detected</span>
        </label>
      </fieldset>

      <fieldset>
        <legend>Subtitles</legend>
        <div class="field">
          <label for="subtitleLangs">Preferred languages</label>
          <input type="text" id="subtitleLangs" placeholder="e.g. en, es, hi (comma-separated)">
        </div>
        <div class="chip-row" aria-label="Quick language additions">
          <button type="button" class="chip" data-lang="en">+ English (en)</button>
          <button type="button" class="chip" data-lang="es">+ Spanish (es)</button>
          <button type="button" class="chip" data-lang="fr">+ French (fr)</button>
          <button type="button" class="chip" data-lang="de">+ German (de)</button>
          <button type="button" class="chip" data-lang="hi">+ Hindi (hi)</button>
          <button type="button" class="chip" data-lang="ja">+ Japanese (ja)</button>
        </div>
        <p class="field-help">Leave blank to keep all subtitle tracks. Matching works for language codes (<code>en</code>, <code>eng</code>, <code>en-us</code>, <code>eng eu</code>) and names (<code>English</code>).</p>
        <label class="check" id="unknownSubCheck">
          <input type="checkbox" id="includeUnknownSubtitleLang" checked>
          <span>Include subtitle tracks when the language cannot be detected</span>
        </label>
      </fieldset>
    </section>

    <section class="card" aria-labelledby="fleets-heading">
      <div class="card-head">
        <div>
          <h2 id="fleets-heading">Provider fleets</h2>
          <p class="card-sub">Choose which provider groups to query. At least one fleet is required.</p>
        </div>
        <span class="step" aria-hidden="true">02</span>
      </div>
      <div class="fleets">
        <label class="fleet" id="fleetCard-sa7">
          <input type="checkbox" id="fleet-sa7" checked>
          <span><span class="fleet-name">SA7</span><span class="fleet-desc">SA7 provider set</span></span>
        </label>
        <label class="fleet" id="fleetCard-nuvio">
          <input type="checkbox" id="fleet-nuvio" checked>
          <span><span class="fleet-name">Nuvio</span><span class="fleet-desc">Nuvio provider set</span></span>
        </label>
        <label class="fleet" id="fleetCard-vega">
          <input type="checkbox" id="fleet-vega" checked>
          <span><span class="fleet-name">Vega</span><span class="fleet-desc">Vega provider set</span></span>
        </label>
      </div>
    </section>

    <section class="card" aria-labelledby="install-heading">
      <div class="card-head">
        <div>
          <h2 id="install-heading">Install</h2>
          <p class="card-sub">Your choices are encoded in the link below. Nothing is saved on the server.</p>
        </div>
        <span class="step" aria-hidden="true">03</span>
      </div>

      <ul class="summary" id="summary" aria-live="polite"></ul>
      <p class="error" id="errorBox" role="alert" hidden></p>
      <div class="url-box" id="manifestUrlBox" aria-label="Manifest URL"></div>

      <div class="actions">
        <button type="button" class="btn-primary" id="btnInstall">Install in Stremio</button>
        <button type="button" id="btnCopy">Copy link</button>
        <a class="button" id="btnOpen" href="#" target="_blank" rel="noopener noreferrer">Open manifest</a>
        <button type="button" id="btnReset">Reset defaults</button>
      </div>
      <p class="status-text" id="copyStatus" aria-live="polite"></p>
      <p class="note">Attached subtitle tracks (<code>subtitles[]</code>) are filtered to your selected languages. Streams are never removed because of subtitles, and embedded audio/subtitles within video containers are passed through unchanged. This addon does not provide a separate subtitles resource.</p>
    </section>

    <footer class="footer">Unified Streams · one addon for three provider fleets</footer>
  </main>

  <script nonce="${scriptNonce}">
    const BASE_URL = "${baseUrl}";
    const PREFILL_CONFIG = ${prefillConfigJson};
    const PREFILL = PREFILL_CONFIG && typeof PREFILL_CONFIG === 'object' ? PREFILL_CONFIG : {};
    const FLEETS = ['sa7', 'nuvio', 'vega'];
    const FLEET_NAMES = { sa7: 'SA7', nuvio: 'Nuvio', vega: 'Vega' };
    const ALL_FLEETS = FLEETS.slice();

    function el(id) {
      return document.getElementById(id);
    }

    function numberOrNull(id) {
      const raw = el(id).value;
      if (raw === '') return null;
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    }

    function selectedBackends() {
      return FLEETS.filter(function (fleet) {
        return el('fleet-' + fleet).checked;
      });
    }

    function setFleetChecked(fleet, checked) {
      el('fleet-' + fleet).checked = checked;
      el('fleetCard-' + fleet).classList.toggle('selected', checked);
    }

    function syncFleetStyles() {
      FLEETS.forEach(function (fleet) {
        el('fleetCard-' + fleet).classList.toggle('selected', el('fleet-' + fleet).checked);
      });
    }

    function parsedSubtitleLangs() {
      const raw = el('subtitleLangs').value;
      if (!raw || !raw.trim()) return [];
      const parts = raw.split(',');
      const result = [];
      const seen = {};
      for (let i = 0; i < parts.length; i++) {
        const clean = parts[i].trim().toLowerCase();
        if (clean && !seen[clean]) {
          seen[clean] = true;
          result.push(clean);
        }
      }
      return result.slice(0, 20);
    }

    function syncUnknownCheckboxes() {
      const hasResolutionBound = el('minRes').value !== '' || el('maxRes').value !== '';
      const hasSizeLimit = el('maxSizeGB').value !== '';
      const hasSubFilter = parsedSubtitleLangs().length > 0;
      el('includeUnknownRes').disabled = !hasResolutionBound;
      el('includeUnknownSize').disabled = !hasSizeLimit;
      el('includeUnknownSubtitleLang').disabled = !hasSubFilter;
      el('unknownResCheck').classList.toggle('disabled', !hasResolutionBound);
      el('unknownSizeCheck').classList.toggle('disabled', !hasSizeLimit);
      el('unknownSubCheck').classList.toggle('disabled', !hasSubFilter);
    }

    function resolutionLabel(height) {
      const labels = {
        240: '240p',
        360: '360p',
        480: '480p',
        576: '576p',
        720: '720p',
        1080: '1080p',
        1440: '1440p',
        2160: '2160p',
        4320: '4320p'
      };
      return labels[height] || height + 'p';
    }

    function resolutionSummary(minRes, maxRes) {
      if (minRes === null && maxRes === null) return 'Any resolution';
      if (minRes !== null && maxRes !== null) {
        if (minRes === maxRes) return resolutionLabel(minRes) + ' only';
        return resolutionLabel(minRes) + ' to ' + resolutionLabel(maxRes);
      }
      if (minRes !== null) return resolutionLabel(minRes) + ' and above';
      return resolutionLabel(maxRes) + ' and below';
    }

    function fleetSummary(backends) {
      if (backends.length === FLEETS.length) return 'All fleets (SA7, Nuvio, Vega)';
      return backends.map(function (fleet) { return FLEET_NAMES[fleet]; }).join(', ');
    }

    function addSummary(label, value) {
      const item = document.createElement('li');
      const strong = document.createElement('strong');
      strong.textContent = label + ': ';
      item.appendChild(strong);
      item.appendChild(document.createTextNode(value));
      el('summary').appendChild(item);
    }

    function renderSummary(minRes, maxRes, maxSizeGB, backends, subLangs, includeUnknownSub) {
      const summary = el('summary');
      summary.replaceChildren();

      const resolution = resolutionSummary(minRes, maxRes);
      const hasResolutionBound = minRes !== null || maxRes !== null;
      const unknownRes = hasResolutionBound
        ? el('includeUnknownRes').checked ? ' (including unknown)' : ' (excluding unknown)'
        : '';
      addSummary('Resolution', resolution + unknownRes);

      const size = maxSizeGB === null ? 'No size limit' : 'Up to ' + maxSizeGB + ' GB';
      const unknownSize = maxSizeGB !== null
        ? el('includeUnknownSize').checked ? ' (including unknown)' : ' (excluding unknown)'
        : '';
      addSummary('File size', size + unknownSize);

      if (subLangs.length === 0) {
        addSummary('Subtitles', 'All tracks retained (no filter)');
      } else {
        const unk = includeUnknownSub ? 'including unknown' : 'excluding unknown';
        addSummary('Subtitles', 'Only ' + subLangs.join(', ') + ' (' + unk + ')');
      }

      addSummary('Fleets', fleetSummary(backends));
    }

    function validate(minRes, maxRes, maxSizeGB) {
      const errors = [];
      if (minRes !== null && maxRes !== null && minRes > maxRes) {
        errors.push('Minimum resolution cannot be higher than maximum resolution.');
      }
      if (maxSizeGB !== null && (maxSizeGB < 0.1 || maxSizeGB > 1024)) {
        errors.push('Maximum file size must be between 0.1 and 1024 GB.');
      }
      return errors;
    }

    function setInvalid(errors) {
      const errorBox = el('errorBox');
      errorBox.textContent = errors.join(' ');
      errorBox.hidden = errors.length === 0;
      el('btnInstall').disabled = errors.length > 0;
      el('btnCopy').disabled = errors.length > 0;
      el('btnOpen').setAttribute('aria-disabled', errors.length > 0 ? 'true' : 'false');
      if (errors.length > 0) {
        el('manifestUrlBox').textContent = 'Fix the settings above to generate an install link.';
        el('btnOpen').removeAttribute('href');
      }
    }

    function updateUrl() {
      syncUnknownCheckboxes();

      const minRes = numberOrNull('minRes');
      const maxRes = numberOrNull('maxRes');
      const maxSizeGB = numberOrNull('maxSizeGB');
      const backends = selectedBackends();
      const subLangs = parsedSubtitleLangs();
      const includeUnknownSub = el('includeUnknownSubtitleLang').checked;
      const subtitleMode = subLangs.length > 0 ? 'languages' : 'all';
      const errors = validate(minRes, maxRes, maxSizeGB);

      renderSummary(minRes, maxRes, maxSizeGB, backends.length > 0 ? backends : ALL_FLEETS, subLangs, includeUnknownSub);
      setInvalid(errors);
      if (errors.length > 0) return { valid: false, manifestUrl: '' };

      const config = {
        v: 2,
        minRes: minRes,
        maxRes: maxRes,
        includeUnknownRes: el('includeUnknownRes').checked,
        maxSizeGB: maxSizeGB,
        includeUnknownSize: el('includeUnknownSize').checked,
        subtitleMode: subtitleMode,
        subtitleLangs: subLangs,
        includeUnknownSubtitleLang: includeUnknownSub,
        backends: backends
      };

      const b64 = btoa(JSON.stringify(config))
        .replace(/\\+/g, '-')
        .replace(/\\//g, '_')
        .replace(/=+$/, '');
      const manifestUrl = BASE_URL + '/' + b64 + '/manifest.json';
      el('manifestUrlBox').textContent = manifestUrl;
      el('btnOpen').setAttribute('href', manifestUrl);
      return { valid: true, manifestUrl: manifestUrl };
    }

    function setSelectValue(id, value) {
      if (value === null || value === undefined) return;
      const text = String(value);
      const optionExists = Array.prototype.some.call(el(id).options, function (option) {
        return option.value === text;
      });
      if (optionExists) el(id).value = text;
    }

    function applyPrefill() {
      setSelectValue('minRes', PREFILL.minRes);
      setSelectValue('maxRes', PREFILL.maxRes);
      if (PREFILL.maxSizeGB !== null && PREFILL.maxSizeGB !== undefined) {
        el('maxSizeGB').value = String(PREFILL.maxSizeGB);
      }
      if (PREFILL.includeUnknownRes === false) el('includeUnknownRes').checked = false;
      if (PREFILL.includeUnknownSize === false) el('includeUnknownSize').checked = false;

      if (Array.isArray(PREFILL.subtitleLangs) && PREFILL.subtitleLangs.length > 0) {
        el('subtitleLangs').value = PREFILL.subtitleLangs.join(', ');
      } else {
        el('subtitleLangs').value = '';
      }
      if (PREFILL.includeUnknownSubtitleLang === false) {
        el('includeUnknownSubtitleLang').checked = false;
      } else {
        el('includeUnknownSubtitleLang').checked = true;
      }

      const backends = Array.isArray(PREFILL.backends) && PREFILL.backends.length > 0
        ? PREFILL.backends
        : ALL_FLEETS;
      FLEETS.forEach(function (fleet) {
        setFleetChecked(fleet, backends.indexOf(fleet) !== -1);
      });
    }

    function ensureSelectedFleet(changedFleet) {
      if (selectedBackends().length === 0) {
        setFleetChecked(changedFleet, true);
      }
      syncFleetStyles();
    }

    async function copyText(text) {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
      }
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      document.body.removeChild(field);
    }

    ['minRes', 'maxRes', 'maxSizeGB', 'subtitleLangs'].forEach(function (id) {
      el(id).addEventListener('input', updateUrl);
      el(id).addEventListener('change', updateUrl);
    });
    ['includeUnknownRes', 'includeUnknownSize', 'includeUnknownSubtitleLang'].forEach(function (id) {
      el(id).addEventListener('change', updateUrl);
    });
    FLEETS.forEach(function (fleet) {
      el('fleet-' + fleet).addEventListener('change', function () {
        ensureSelectedFleet(fleet);
        updateUrl();
      });
    });

    const chips = document.querySelectorAll('.chip');
    for (let i = 0; i < chips.length; i++) {
      chips[i].addEventListener('click', function () {
        const lang = this.getAttribute('data-lang');
        if (!lang) return;
        const current = parsedSubtitleLangs();
        if (current.indexOf(lang) === -1) {
          current.push(lang);
          el('subtitleLangs').value = current.join(', ');
          updateUrl();
        }
      });
    }

    el('btnInstall').addEventListener('click', function () {
      const result = updateUrl();
      if (!result.valid) return;
      window.location.href = result.manifestUrl.replace(/^https?:\\/\\//, 'stremio://');
    });

    el('btnCopy').addEventListener('click', async function () {
      const result = updateUrl();
      if (!result.valid) return;
      const status = el('copyStatus');
      try {
        await copyText(result.manifestUrl);
        el('btnCopy').textContent = 'Copied';
        status.textContent = 'Install link copied to the clipboard.';
        setTimeout(function () {
          el('btnCopy').textContent = 'Copy link';
          status.textContent = '';
        }, 2000);
      } catch {
        status.textContent = 'Copy failed. Select the link and copy it manually.';
      }
    });

    el('btnReset').addEventListener('click', function () {
      el('minRes').value = '';
      el('maxRes').value = '';
      el('maxSizeGB').value = '';
      el('includeUnknownRes').checked = true;
      el('includeUnknownSize').checked = true;
      el('subtitleLangs').value = '';
      el('includeUnknownSubtitleLang').checked = true;
      FLEETS.forEach(function (fleet) {
        setFleetChecked(fleet, true);
      });
      el('copyStatus').textContent = '';
      updateUrl();
    });

    applyPrefill();
    syncFleetStyles();
    updateUrl();
  </script>
</body>
</html>`;
}
