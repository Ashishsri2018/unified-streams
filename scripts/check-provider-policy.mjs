import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const POLICY_PATH = path.join(rootDir, 'config', 'providers.json');
const AUDIT_PATH = path.join(rootDir, 'config', 'provider-audit.csv');
const FLEETS = ['sa7', 'nuvio', 'vega'];
const DUPLICATE_MODES = ['primary', 'backup'];

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

function fail(message) {
  throw new Error(message);
}

function validateIdList(value, label, { allowStar = false } = {}) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  const seen = new Set();
  for (const raw of value) {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      fail(`${label} contains a non-string or empty id`);
    }
    const id = raw.trim();
    if (!allowStar && id === '*') fail(`${label} cannot contain '*'`);
    if (!/^[A-Za-z0-9_.*-]+$/.test(id)) fail(`${label} contains an invalid id '${id}'`);
    const key = id.toLowerCase();
    if (seen.has(key)) fail(`${label} contains duplicate id '${id}'`);
    seen.add(key);
  }
  return value.map((id) => id.trim());
}

function verifyPolicy() {
  if (!fs.existsSync(POLICY_PATH)) {
    fail(`Policy file missing at ${POLICY_PATH}`);
  }
  const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf-8'));

  if (typeof policy.defaultProfile !== 'string' || policy.defaultProfile.trim().length === 0) {
    fail("'defaultProfile' must be a non-empty string");
  }
  if (!Array.isArray(policy.duplicatePriority) || policy.duplicatePriority.length === 0) {
    fail("'duplicatePriority' must be a non-empty array");
  }
  const prioritySeen = new Set();
  for (const fleet of policy.duplicatePriority) {
    if (!FLEETS.includes(fleet)) fail(`'duplicatePriority' contains unknown fleet '${fleet}'`);
    if (prioritySeen.has(fleet)) fail(`'duplicatePriority' repeats fleet '${fleet}'`);
    prioritySeen.add(fleet);
  }

  const locked = validateIdList(policy.locked ?? [], "'locked'");
  validateIdList(policy.adoptUpstreamDisabled ?? [], "'adoptUpstreamDisabled'");

  if (!policy.duplicates || typeof policy.duplicates !== 'object' || Array.isArray(policy.duplicates)) {
    fail("'duplicates' must be an object keyed by duplicate group");
  }
  const duplicateIdsByFleet = { sa7: new Set(), nuvio: new Set(), vega: new Set() };
  for (const [group, copies] of Object.entries(policy.duplicates)) {
    if (!copies || typeof copies !== 'object' || Array.isArray(copies)) {
      fail(`Duplicate group '${group}' must be an object keyed by fleet`);
    }
    let total = 0;
    for (const [fleet, ids] of Object.entries(copies)) {
      if (!FLEETS.includes(fleet)) {
        fail(`Duplicate group '${group}' has unknown fleet '${fleet}'`);
      }
      const list = validateIdList(ids, `Duplicate group '${group}' fleet '${fleet}'`);
      total += list.length;
      for (const id of list) {
        const key = id.toLowerCase();
        // The same upstream ID may appear in the same logical group in two
        // fleets, but a fleet cannot map one ID to two groups.
        if (duplicateIdsByFleet[fleet].has(key)) {
          fail(
            `Provider '${id}' appears in more than one duplicate group for fleet '${fleet}'`,
          );
        }
        duplicateIdsByFleet[fleet].add(key);
      }
    }
    if (total === 0) fail(`Duplicate group '${group}' has no providers`);
    const hasPrimary = policy.duplicatePriority.some((fleet) => (copies[fleet] ?? []).length > 0);
    if (!hasPrimary) {
      fail(`Duplicate group '${group}' has no copy in duplicatePriority fleets`);
    }
  }

  if (!policy.profiles || typeof policy.profiles !== 'object' || Array.isArray(policy.profiles)) {
    fail("'profiles' must be an object keyed by profile name");
  }
  if (!policy.profiles[policy.defaultProfile]) {
    fail(`'defaultProfile' '${policy.defaultProfile}' is not present in 'profiles'`);
  }

  const blocks = [];
  for (const [name, profile] of Object.entries(policy.profiles)) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      fail(`Profile '${name}' must be an object`);
    }
    if (profile.duplicateMode !== undefined && !DUPLICATE_MODES.includes(profile.duplicateMode)) {
      fail(`Profile '${name}' has invalid duplicateMode '${profile.duplicateMode}'`);
    }
    for (const [fleet, block] of Object.entries(profile)) {
      if (fleet === 'duplicateMode') continue;
      if (!FLEETS.includes(fleet)) {
        fail(`Profile '${name}' has unknown fleet '${fleet}'`);
      }
      if (!block || typeof block !== 'object' || Array.isArray(block)) {
        fail(`Profile '${name}' fleet '${fleet}' must be an object`);
      }
      const deny = validateIdList(block.deny ?? [], `Profile '${name}' fleet '${fleet}' deny`, {
        allowStar: true,
      });
      for (const id of deny) {
        if (id !== '*' && duplicateIdsByFleet[fleet].has(id.toLowerCase())) {
          fail(
            `Profile '${name}' fleet '${fleet}' deny lists duplicate provider '${id}'; ` +
              'duplicate allocation is derived from duplicates + duplicatePriority',
          );
        }
        if (locked.some((lockedId) => lockedId.toLowerCase() === id.toLowerCase())) {
          fail(
            `Profile '${name}' fleet '${fleet}' deny lists locked provider '${id}'; ` +
              'locked is the single source for hard-disabled providers',
          );
        }
      }
      blocks.push({ fleet, deny, label: `profile '${name}'` });
    }
  }

  const auditByFleet = { sa7: new Set(), nuvio: new Set(), vega: new Set() };
  if (fs.existsSync(AUDIT_PATH)) {
    const auditRows = parseCsv(fs.readFileSync(AUDIT_PATH, 'utf-8'));
    if (auditRows.length === 0) fail('provider-audit.csv is empty');
    for (const fleet of FLEETS) {
      if (!(fleet in auditRows[0])) {
        fail(`provider-audit.csv is missing the '${fleet}' column`);
      }
    }
    for (const row of auditRows) {
      for (const fleet of FLEETS) {
        for (const id of (row[fleet] || '').split('|')) {
          const trimmed = id.trim();
          if (trimmed) auditByFleet[fleet].add(trimmed.toLowerCase());
        }
      }
    }
  }

  const warnUnlisted = (fleet, id, label) => {
    if (id === '*') return;
    if (auditByFleet[fleet].size === 0) return;
    if (!auditByFleet[fleet].has(id.toLowerCase())) {
      console.warn(
        `[check-policy] Note: ID '${id}' in '${fleet}' (${label}) is not listed in provider-audit.csv`,
      );
    }
  };
  for (const { fleet, deny, label } of blocks) {
    for (const id of deny) warnUnlisted(fleet, id, label);
  }
  for (const [group, copies] of Object.entries(policy.duplicates)) {
    for (const [fleet, ids] of Object.entries(copies)) {
      for (const id of ids) warnUnlisted(fleet, id, `duplicate group '${group}'`);
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
