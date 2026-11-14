import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const POLICY_PATH = path.join(rootDir, 'config', 'providers.json');
const AUDIT_PATH = path.join(rootDir, 'config', 'provider-audit.csv');
const FLEETS = ['sa7', 'nuvio', 'vega'];
const HARD_DISABLED = ['youtube', 'torrentio', 'internetarchive', 'brellor', 'mxplayer'];

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

function validateFleetBlock(block, fleet, label) {
  if (!block) {
    throw new Error(`Missing fleet '${fleet}' in ${label}`);
  }
  if (!['allow', 'deny'].includes(block.mode)) {
    throw new Error(`Invalid mode '${block.mode}' for '${fleet}' in ${label}`);
  }
  if (!Array.isArray(block.ids)) {
    throw new Error(`'ids' must be an array for '${fleet}' in ${label}`);
  }
  return block;
}

function validateHardDisabled(block, fleet, label) {
  const ids = new Set(block.ids.map((id) => id.toLowerCase()));
  if (block.mode === 'allow') {
    for (const disabled of HARD_DISABLED) {
      if (ids.has(disabled)) {
        throw new Error(
          `Default-disabled provider '${disabled}' cannot be allowlisted in '${fleet}' (${label})`,
        );
      }
    }
  }
}

function verifyPolicy() {
  if (!fs.existsSync(POLICY_PATH)) {
    throw new Error(`Policy file missing at ${POLICY_PATH}`);
  }
  const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf-8'));

  const auditByFleet = { sa7: new Set(), nuvio: new Set(), vega: new Set() };
  if (fs.existsSync(AUDIT_PATH)) {
    const auditRows = parseCsv(fs.readFileSync(AUDIT_PATH, 'utf-8'));
    for (const row of auditRows) {
      if (auditByFleet[row.component]) {
        auditByFleet[row.component].add(row.id.toLowerCase());
      }
    }
  }

  const blocks = [];
  for (const fleet of FLEETS) {
    const block = validateFleetBlock(policy[fleet], fleet, 'default policy');
    validateHardDisabled(block, fleet, 'default policy');
    blocks.push({ fleet, block, label: 'default policy' });
  }

  const instances = policy.instances;
  if (instances !== undefined) {
    if (!instances || typeof instances !== 'object' || Array.isArray(instances)) {
      throw new Error("'instances' must be an object keyed by instance name");
    }
    for (const [name, instance] of Object.entries(instances)) {
      if (!instance || typeof instance !== 'object' || Array.isArray(instance)) {
        throw new Error(`Instance '${name}' must be an object keyed by fleet`);
      }
      for (const [fleet, block] of Object.entries(instance)) {
        if (!FLEETS.includes(fleet)) {
          throw new Error(`Instance '${name}' has unknown fleet '${fleet}'`);
        }
        validateFleetBlock(block, fleet, `instance '${name}'`);
        validateHardDisabled(block, fleet, `instance '${name}'`);
        blocks.push({ fleet, block, label: `instance '${name}'` });
      }
    }
  }

  for (const { fleet, block, label } of blocks) {
    if (auditByFleet[fleet].size === 0) continue;
    for (const id of block.ids) {
      if (id === '*') continue;
      if (!auditByFleet[fleet].has(id.toLowerCase())) {
        console.warn(
          `[check-policy] Note: ID '${id}' in '${fleet}' (${label}) is not listed in provider-audit.csv`,
        );
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
