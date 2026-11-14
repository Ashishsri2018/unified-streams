import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const POLICY_PATH = path.join(rootDir, 'config', 'providers.json');
const AUDIT_PATH = path.join(rootDir, 'config', 'provider-audit.csv');

function parseCsv(content) {
  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  const header = lines[0].split(',');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    // Simple CSV parser supporting quotes
    const line = lines[i];
    const parts = [];
    let inQuotes = false;
    let current = '';
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    parts.push(current.trim());
    const row = {};
    for (let h = 0; h < header.length; h++) {
      row[header[h].trim()] = parts[h] || '';
    }
    rows.push(row);
  }
  return rows;
}

function verifyPolicy() {
  if (!fs.existsSync(POLICY_PATH)) {
    throw new Error(`Policy file missing at ${POLICY_PATH}`);
  }
  const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf-8'));

  for (const fleet of ['sa7', 'nuvio', 'vega']) {
    if (!policy[fleet]) {
      throw new Error(`Missing fleet '${fleet}' in policy`);
    }
    if (!['allow', 'deny'].includes(policy[fleet].mode)) {
      throw new Error(`Invalid mode '${policy[fleet].mode}' for fleet '${fleet}'`);
    }
    if (!Array.isArray(policy[fleet].ids)) {
      throw new Error(`'ids' must be an array for fleet '${fleet}'`);
    }
  }

  // Validate against provider-audit.csv if present
  if (fs.existsSync(AUDIT_PATH)) {
    const auditRows = parseCsv(fs.readFileSync(AUDIT_PATH, 'utf-8'));
    const auditByFleet = { sa7: new Set(), nuvio: new Set(), vega: new Set() };
    for (const row of auditRows) {
      if (auditByFleet[row.component]) {
        auditByFleet[row.component].add(row.id);
      }
    }

    // Verify all policy ids exist in audit for that fleet
    for (const fleet of ['sa7', 'nuvio', 'vega']) {
      for (const id of policy[fleet].ids) {
        if (auditByFleet[fleet].size > 0 && !auditByFleet[fleet].has(id)) {
          console.warn(`[check-policy] Note: ID '${id}' in fleet '${fleet}' is not listed in provider-audit.csv`);
        }
      }
    }

    // Verify default-disabled classes remain disabled (YouTube, torrent scraper, Internet Archive)
    const disabledClasses = ['youtube', 'torrentio', 'internetArchive', 'brellor'];
    for (const target of disabledClasses) {
      let isDisabled = false;
      if (policy.vega.ids.includes(target) && policy.vega.mode === 'deny') isDisabled = true;
      if (policy.nuvio.ids.includes(target) && policy.nuvio.mode === 'deny') isDisabled = true;
      if (!policy.sa7.ids.includes(target) && policy.sa7.mode === 'allow') isDisabled = true;
      if (policy.sa7.ids.includes(target) && policy.sa7.mode === 'deny') isDisabled = true;
      if (!isDisabled) {
        throw new Error(`Default-disabled provider '${target}' must remain disabled`);
      }
    }
  }

  console.log('[check-policy] OK: Provider policy is valid.');
}

try {
  verifyPolicy();
} catch (err) {
  console.error('[check-policy] ERROR:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
