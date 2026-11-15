import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    endpoint: { type: 'string' },
    token: { type: 'string' },
    limit: { type: 'string', default: '20' },
    fleet: { type: 'string' },
    level: { type: 'string' },
  },
  strict: false,
});

const endpoint = values.endpoint || process.env.CLOUDFLARE_LOG_ENDPOINT;
const token = values.token || process.env.CLOUDFLARE_LOG_TOKEN;

if (!endpoint) {
  console.log('No CLOUDFLARE_LOG_ENDPOINT specified. Provide via env or --endpoint.');
  process.exit(0);
}

async function queryLogs() {
  const url = new URL(`${endpoint.replace(/\/+$/, '')}/v1/query`);
  if (values.limit) url.searchParams.set('limit', values.limit);
  if (values.fleet) url.searchParams.set('fleet', values.fleet);

  const headers = {};
  if (token) headers['authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error(`Query failed: HTTP ${res.status}`);
    process.exit(1);
  }

  const logs = await res.json();
  console.log(JSON.stringify(logs, null, 2));
}

queryLogs().catch((err) => {
  console.error('Error querying logs:', err.message);
  process.exit(1);
});
