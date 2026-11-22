#!/usr/bin/env node
import fs from 'node:fs';

const DEFAULT_CSV = 'config/provider-audit.csv';
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_PREFIX_BYTES = 64 * 1024;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function parseArgs(argv) {
  const args = {
    csv: DEFAULT_CSV,
    concurrency: DEFAULT_CONCURRENCY,
    timeout: DEFAULT_TIMEOUT_MS,
    scheme: 'https',
    fallbackHttp: false,
    out: '',
    limit: 0,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--csv':
        args.csv = argv[++i];
        break;
      case '--concurrency':
        args.concurrency = Number(argv[++i]);
        break;
      case '--timeout':
        args.timeout = Number(argv[++i]);
        break;
      case '--scheme':
        args.scheme = argv[++i];
        break;
      case '--out':
        args.out = argv[++i];
        break;
      case '--limit':
        args.limit = Number(argv[++i]);
        break;
      case '--fallback-http':
        args.fallbackHttp = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.scheme !== 'http' && args.scheme !== 'https') {
    throw new Error(`--scheme must be http or https, got '${args.scheme}'`);
  }
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1) {
    throw new Error('--concurrency must be a positive integer');
  }
  if (!Number.isFinite(args.timeout) || args.timeout < 1000) {
    throw new Error('--timeout must be at least 1000ms');
  }
  if (!Number.isInteger(args.limit) || args.limit < 0) {
    throw new Error('--limit must be a non-negative integer');
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/check-provider-reachability.mjs [options]

Probes every Website in config/provider-audit.csv from the current host.

Options:
  --csv <path>         Audit CSV path (default: ${DEFAULT_CSV})
  --concurrency <n>    Parallel probes (default: ${DEFAULT_CONCURRENCY})
  --timeout <ms>       Per-request timeout (default: ${DEFAULT_TIMEOUT_MS})
  --scheme <scheme>    http or https (default: https)
  --fallback-http      Retry with http when the https probe fails
  --limit <n>          Probe only the first n hosts (0 = all)
  --out <path>         Also write the CSV report to this path
  -h, --help           Show this help

The report is written to stdout as CSV. Diagnostics go to stderr.`);
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    throw new Error('CSV is empty');
  }

  const header = splitCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i]);
    const row = {};
    for (let h = 0; h < header.length; h++) {
      row[header[h]] = parts[h] ?? '';
    }
    rows.push(row);
  }
  return { header, rows };
}

function splitCsvLine(line) {
  const parts = [];
  let inQuotes = false;
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current.trim());
  return parts;
}

function normalizeHost(value) {
  let host = value.trim();
  if (!host) return '';
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  host = host.split('/')[0].split('?')[0].split('#')[0];
  return host.trim();
}

async function readPrefix(response, maxBytes) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(Buffer.from(value));
        total += value.byteLength;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).subarray(0, maxBytes).toString('utf8');
}

function classifyError(error) {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return 'timeout';
  const code = error?.cause?.code || error?.code;
  if (code) return String(code);
  return error?.message || 'error';
}

async function probeOnce(host, scheme, timeoutMs) {
  const url = `${scheme}://${host}/`;
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
    });

    const bodyPrefix = await readPrefix(response, MAX_PREFIX_BYTES);
    const challenge =
      response.headers.get('cf-mitigated') === 'challenge' ||
      /cf-chl|challenge-platform|Just a moment\.\.\.|Attention Required! \| Cloudflare/i.test(bodyPrefix);

    return {
      host,
      scheme,
      status: response.status,
      ok: response.ok,
      ms: Math.round(performance.now() - started),
      final_url: response.url || url,
      server: response.headers.get('server') || '',
      cf_ray: response.headers.get('cf-ray') ? 'yes' : '',
      challenge: challenge ? 'yes' : '',
      bytes: bodyPrefix.length,
      error: '',
    };
  } catch (error) {
    return {
      host,
      scheme,
      status: 0,
      ok: false,
      ms: Math.round(performance.now() - started),
      final_url: url,
      server: '',
      cf_ray: '',
      challenge: '',
      bytes: 0,
      error: classifyError(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probe(host, args) {
  const schemes = args.fallbackHttp ? ['https', 'http'] : [args.scheme];
  let result = null;
  for (const scheme of schemes) {
    result = await probeOnce(host, scheme, args.timeout);
    if (result.ok) break;
  }
  return result;
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(results) {
  const columns = [
    'host',
    'scheme',
    'status',
    'ok',
    'ms',
    'final_url',
    'server',
    'cf_ray',
    'challenge',
    'bytes',
    'error',
  ];
  const lines = [columns.join(',')];
  for (const result of results) {
    lines.push(columns.map((column) => csvEscape(result[column])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

async function runPool(hosts, concurrency, worker) {
  const results = new Array(hosts.length);
  let next = 0;

  async function run() {
    while (true) {
      const index = next++;
      if (index >= hosts.length) return;
      results[index] = await worker(hosts[index], index);
      const result = results[index];
      const label = result.error ? `error=${result.error}` : `status=${result.status}`;
      console.error(`[${index + 1}/${hosts.length}] ${hosts[index]} ${label} ${result.ms}ms`);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, hosts.length) }, () => run());
  await Promise.all(runners);
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const content = fs.readFileSync(args.csv, 'utf8');
  const { header, rows } = parseCsv(content);

  if (!header.includes('Website')) {
    throw new Error(`CSV '${args.csv}' is missing the 'Website' column`);
  }

  let hosts = rows.map((row) => normalizeHost(row.Website)).filter(Boolean);
  hosts = [...new Set(hosts)];
  if (args.limit > 0) {
    hosts = hosts.slice(0, args.limit);
  }

  console.error(
    `[check-reachability] probing ${hosts.length} hosts from ${process.platform} ` +
      `(concurrency=${args.concurrency}, timeout=${args.timeout}ms, scheme=${args.scheme})`,
  );

  const started = performance.now();
  const results = await runPool(hosts, args.concurrency, (host) => probe(host, args));
  const csv = toCsv(results);

  if (args.out) {
    fs.writeFileSync(args.out, csv);
    console.error(`[check-reachability] report written to ${args.out}`);
  } else {
    process.stdout.write(csv);
  }

  const ok = results.filter((result) => result.ok).length;
  const blocked = results.filter((result) => result.status === 403 || result.status === 429).length;
  const challenged = results.filter((result) => result.challenge).length;
  const errors = results.filter((result) => result.status === 0).length;
  const elapsed = Math.round(performance.now() - started);

  console.error(
    `[check-reachability] done in ${elapsed}ms: ok=${ok} ` +
      `http403/429=${blocked} challenge=${challenged} network_errors=${errors} total=${results.length}`,
  );
}

main().catch((error) => {
  console.error(`[check-reachability] ${error.message}`);
  process.exit(1);
});
