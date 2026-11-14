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
  <title>Unified Streams — Configure</title>
  <link rel="icon" type="image/x-icon" href="${baseUrl}/favicon.ico">
  <style>
    :root {
      --bg: #0f172a; --surface: #1e293b; --elevated: #334155;
      --border: #334155; --text: #f8fafc; --text-muted: #94a3b8;
      --accent: #6366f1; --accent-hover: #4f46e5; --success: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg); color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 1.5rem 1rem; line-height: 1.5;
    }
    .container { max-width: 680px; margin: 0 auto; }
    .header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
    .header img { width: 56px; height: 56px; border-radius: 12px; }
    .card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 10px; padding: 1.25rem; margin-bottom: 1.25rem;
    }
    h2 { font-size: 1.1rem; margin-bottom: 0.75rem; color: #e2e8f0; }
    .field { margin-bottom: 1rem; }
    label { display: block; font-size: 0.9rem; margin-bottom: 0.35rem; color: var(--text-muted); }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    @media (max-width: 500px) { .row { grid-template-columns: 1fr; } }
    select, input[type="number"], input[type="text"] {
      width: 100%; background: var(--bg); border: 1px solid var(--border);
      color: var(--text); padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.95rem;
    }
    .checkbox-label { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; margin-top: 0.5rem; }
    .hint { font-size: 0.8rem; color: #64748b; margin-top: 0.35rem; }
    .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.5rem; }
    .chip {
      background: var(--elevated); padding: 0.3rem 0.6rem; border-radius: 16px;
      font-size: 0.85rem; cursor: pointer; user-select: none;
    }
    .chip.selected { background: var(--accent); color: #fff; }
    .url-box {
      background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
      padding: 0.6rem; font-family: monospace; font-size: 0.85rem; word-break: break-all;
      margin: 0.75rem 0;
    }
    .btn-group { display: flex; gap: 0.5rem; }
    button {
      flex: 1; padding: 0.65rem 1rem; border-radius: 6px; font-weight: 600;
      cursor: pointer; border: none; font-size: 0.9rem;
    }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-secondary { background: var(--elevated); color: var(--text); }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${baseUrl}/logo.png" alt="Unified Streams Logo">
      <div>
        <h1>Unified Streams</h1>
        <p class="hint">One unified Stremio addon combining SA7, Nuvio, and Vega.</p>
      </div>
    </div>

    <!-- 1. Stream Quality -->
    <div class="card">
      <h2>1. Stream Quality</h2>
      <div class="row">
        <div class="field">
          <label for="minRes">Minimum Resolution</label>
          <select id="minRes">
            <option value="">Any</option><option value="240">240p</option>
            <option value="360">360p</option><option value="480">480p</option>
            <option value="720">720p</option><option value="1080">1080p</option>
            <option value="1440">1440p (2K)</option><option value="2160">2160p (4K)</option>
          </select>
        </div>
        <div class="field">
          <label for="maxRes">Maximum Resolution</label>
          <select id="maxRes">
            <option value="">Any</option><option value="480">480p</option>
            <option value="720">720p</option><option value="1080">1080p</option>
            <option value="1440">1440p (2K)</option><option value="2160">2160p (4K)</option>
          </select>
        </div>
      </div>
      <p class="hint">Selecting 720p max includes 720p and lower; it excludes 1080p and above.</p>
      <label class="checkbox-label">
        <input type="checkbox" id="includeUnknownRes" checked>
        <span>Include streams with unknown resolution</span>
      </label>
    </div>

    <!-- 2. File Size -->
    <div class="card">
      <h2>2. File Size</h2>
      <div class="field">
        <label for="maxSizeGB">Maximum File Size (GB)</label>
        <input type="number" id="maxSizeGB" step="0.1" min="0.1" max="1024" placeholder="No limit">
      </div>
      <label class="checkbox-label">
        <input type="checkbox" id="includeUnknownSize" checked>
        <span>Include streams with unknown file size</span>
      </label>
    </div>

    <!-- 3. Subtitles -->
    <div class="card">
      <h2>3. Subtitles</h2>
      <div class="field">
        <label class="checkbox-label"><input type="radio" name="subMode" value="all" checked> Keep all separate subtitles</label>
        <label class="checkbox-label"><input type="radio" name="subMode" value="none"> Remove separate subtitles</label>
        <label class="checkbox-label"><input type="radio" name="subMode" value="languages"> Only selected languages</label>
      </div>
      <div id="subLangsContainer" style="display:none;">
        <label>Selected Languages</label>
        <div class="chips" id="langChips"></div>
        <input type="text" id="extraLangs" placeholder="Other codes (e.g. ja, ko, de)" style="margin-top:0.5rem;">
        <label class="checkbox-label">
          <input type="checkbox" id="includeUnknownSubtitleLang">
          <span>Include subtitle tracks with unknown language</span>
        </label>
      </div>
      <p class="hint">Filters only separate subtitle tracks. Embedded subtitles are never modified.</p>
    </div>

    <!-- 4. Fleets -->
    <div class="card">
      <h2>4. Provider Fleets</h2>
      <label class="checkbox-label"><input type="checkbox" id="fleet-sa7" checked> SA7 Providers</label>
      <label class="checkbox-label"><input type="checkbox" id="fleet-nuvio" checked> Nuvio Providers</label>
      <label class="checkbox-label"><input type="checkbox" id="fleet-vega" checked> Vega Providers</label>
    </div>

    <!-- 5. Install -->
    <div class="card">
      <h2>5. Install Addon</h2>
      <div class="url-box" id="manifestUrlBox"></div>
      <div class="btn-group">
        <button class="btn-primary" id="btnInstall">Install in Stremio</button>
        <button class="btn-secondary" id="btnCopy">Copy Link</button>
        <button class="btn-secondary" id="btnReset">Reset</button>
      </div>
    </div>
  </div>

  <script nonce="${scriptNonce}">
    const BASE_URL = "${baseUrl}";
    const PREFILL_CONFIG = ${prefillConfigJson};
    const COMMON_LANGS = [
      { code: 'en', name: 'English' }, { code: 'hi', name: 'Hindi' },
      { code: 'ta', name: 'Tamil' }, { code: 'te', name: 'Telugu' },
      { code: 'ml', name: 'Malayalam' }, { code: 'kn', name: 'Kannada' },
      { code: 'ja', name: 'Japanese' }, { code: 'ko', name: 'Korean' },
      { code: 'es', name: 'Spanish' }, { code: 'fr', name: 'French' },
      { code: 'multi', name: 'Multi' }
    ];
    const PREFILL = PREFILL_CONFIG && typeof PREFILL_CONFIG === 'object' ? PREFILL_CONFIG : {};
    const prefillLangs = Array.isArray(PREFILL.subtitleLangs) ? PREFILL.subtitleLangs : [];
    let selectedLangs = new Set(prefillLangs.length > 0 ? prefillLangs : ['en']);

    const chipsContainer = document.getElementById('langChips');
    COMMON_LANGS.forEach(l => {
      const chip = document.createElement('div');
      chip.className = 'chip' + (selectedLangs.has(l.code) ? ' selected' : '');
      chip.textContent = l.name;
      chip.onclick = () => {
        if (selectedLangs.has(l.code)) selectedLangs.delete(l.code);
        else selectedLangs.add(l.code);
        chip.className = 'chip' + (selectedLangs.has(l.code) ? ' selected' : '');
        updateUrl();
      };
      chipsContainer.appendChild(chip);
    });

    document.querySelectorAll('input[name="subMode"]').forEach(r => {
      r.addEventListener('change', (e) => {
        document.getElementById('subLangsContainer').style.display = e.target.value === 'languages' ? 'block' : 'none';
        updateUrl();
      });
    });

    ['minRes', 'maxRes', 'maxSizeGB', 'extraLangs'].forEach(id => {
      document.getElementById(id).addEventListener('input', updateUrl);
    });
    ['includeUnknownRes', 'includeUnknownSize', 'includeUnknownSubtitleLang', 'fleet-sa7', 'fleet-nuvio', 'fleet-vega'].forEach(id => {
      document.getElementById(id).addEventListener('change', updateUrl);
    });

    function applyPrefill() {
      const setValue = (id, value) => {
        if (value === null || value === undefined) return;
        document.getElementById(id).value = String(value);
      };
      setValue('minRes', PREFILL.minRes);
      setValue('maxRes', PREFILL.maxRes);
      setValue('maxSizeGB', PREFILL.maxSizeGB);
      if (PREFILL.includeUnknownRes === false) document.getElementById('includeUnknownRes').checked = false;
      if (PREFILL.includeUnknownSize === false) document.getElementById('includeUnknownSize').checked = false;
      if (PREFILL.includeUnknownSubtitleLang === true) document.getElementById('includeUnknownSubtitleLang').checked = true;

      const mode = ['all', 'none', 'languages'].includes(PREFILL.subtitleMode) ? PREFILL.subtitleMode : 'all';
      const modeInput = document.querySelector('input[name="subMode"][value="' + mode + '"]');
      if (modeInput) modeInput.checked = true;
      document.getElementById('subLangsContainer').style.display = mode === 'languages' ? 'block' : 'none';

      const commonCodes = new Set(COMMON_LANGS.map(l => l.code));
      const extra = prefillLangs.filter(code => !commonCodes.has(code));
      document.getElementById('extraLangs').value = extra.join(', ');

      const backends = Array.isArray(PREFILL.backends) && PREFILL.backends.length > 0
        ? PREFILL.backends
        : ['sa7', 'nuvio', 'vega'];
      ['sa7', 'nuvio', 'vega'].forEach(name => {
        document.getElementById('fleet-' + name).checked = backends.includes(name);
      });
    }

    function updateUrl() {
      const minRes = document.getElementById('minRes').value ? parseInt(document.getElementById('minRes').value, 10) : null;
      const maxRes = document.getElementById('maxRes').value ? parseInt(document.getElementById('maxRes').value, 10) : null;
      const maxSizeGB = document.getElementById('maxSizeGB').value ? parseFloat(document.getElementById('maxSizeGB').value) : null;
      const subMode = document.querySelector('input[name="subMode"]:checked').value;
      const backends = [];
      if (document.getElementById('fleet-sa7').checked) backends.push('sa7');
      if (document.getElementById('fleet-nuvio').checked) backends.push('nuvio');
      if (document.getElementById('fleet-vega').checked) backends.push('vega');
      if (backends.length === 0) backends.push('sa7', 'nuvio', 'vega');

      const extra = document.getElementById('extraLangs').value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const langs = Array.from(new Set([...selectedLangs, ...extra]));

      const config = {
        v: 2, minRes, maxRes,
        includeUnknownRes: document.getElementById('includeUnknownRes').checked,
        maxSizeGB,
        includeUnknownSize: document.getElementById('includeUnknownSize').checked,
        subtitleMode: subMode,
        subtitleLangs: langs,
        includeUnknownSubtitleLang: document.getElementById('includeUnknownSubtitleLang').checked,
        backends
      };

      const b64 = btoa(JSON.stringify(config)).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
      const manifestUrl = BASE_URL + '/' + b64 + '/manifest.json';
      document.getElementById('manifestUrlBox').textContent = manifestUrl;
      return { b64, manifestUrl };
    }

    document.getElementById('btnInstall').onclick = () => {
      const { manifestUrl } = updateUrl();
      const stremioUrl = manifestUrl.replace(/^https?:\\/\\//, 'stremio://');
      window.location.href = stremioUrl;
    };
    document.getElementById('btnCopy').onclick = () => {
      const { manifestUrl } = updateUrl();
      navigator.clipboard.writeText(manifestUrl);
      document.getElementById('btnCopy').textContent = 'Copied!';
      setTimeout(() => { document.getElementById('btnCopy').textContent = 'Copy Link'; }, 2000);
    };
    document.getElementById('btnReset').onclick = () => {
      window.location.href = BASE_URL + '/configure';
    };

    applyPrefill();
    updateUrl();
  </script>
</body>
</html>`;
}
