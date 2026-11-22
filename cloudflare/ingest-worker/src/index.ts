interface Env {
  DB: D1Database;
  LOG_BUCKET?: R2Bucket;
  AUTH_TOKEN?: string;
}

interface RawLogEvent {
  id?: string;
  ts: string;
  level: string;
  service: string;
  fleet?: string;
  event: string;
  requestId?: string;
  route?: string;
  type?: string;
  contentId?: string;
  provider?: string;
  outcome?: string;
  status?: number;
  durationMs?: number;
  streams?: number;
  error?: { name: string; message: string };
  meta?: Record<string, unknown>;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (!env.AUTH_TOKEN) {
      return new Response('Ingest token not configured', { status: 503 });
    }
    const authHeader = req.headers.get('authorization') || '';
    if (authHeader !== `Bearer ${env.AUTH_TOKEN}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    if (url.pathname === '/v1/logs' && req.method === 'POST') {
      try {
        const rawBody = await req.text();
        if (rawBody.length > 1_000_000) {
          return new Response('Payload too large', { status: 413 });
        }
        const body = JSON.parse(rawBody) as { events?: unknown };
        const incoming = Array.isArray(body?.events) ? body.events : [];
        const events = incoming
          .slice(0, 500)
          .filter((value): value is RawLogEvent => {
            if (typeof value !== 'object' || value === null) return false;
            const e = value as Record<string, unknown>;
            return (
              typeof e.ts === 'string' && e.ts.length <= 64 &&
              typeof e.level === 'string' && e.level.length <= 16 &&
              typeof e.service === 'string' && e.service.length <= 32 &&
              typeof e.event === 'string' && e.event.length <= 128
            );
          });
        if (events.length === 0) return new Response('OK', { status: 200 });

        // Insert batch to D1
        const statements = events.map((e) => {
          const id = e.id || crypto.randomUUID();
          return env.DB.prepare(
            `INSERT INTO log_events (id, ts, level, service, fleet, event, request_id, route, type, content_id, provider, outcome, status, duration_ms, streams, error_name, error_message, meta_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            id, e.ts, e.level, e.service, e.fleet || null, e.event, e.requestId || null,
            e.route || null, e.type || null, e.contentId || null, e.provider || null,
            e.outcome || null, e.status || null, e.durationMs || null, e.streams || null,
            e.error?.name || null, e.error?.message || null, e.meta ? JSON.stringify(e.meta) : null
          );
        });

        await env.DB.batch(statements);

        // Archive to R2 if bound
        if (env.LOG_BUCKET) {
          const key = `logs/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${crypto.randomUUID()}.json`;
          await env.LOG_BUCKET.put(key, JSON.stringify(events));
        }

        return new Response('OK', { status: 200 });
      } catch (err) {
        return new Response(String(err), { status: 500 });
      }
    }

    if (url.pathname === '/v1/query' && req.method === 'GET') {
      const parsedLimit = Number.parseInt(url.searchParams.get('limit') || '50', 10);
      const limit = Number.isFinite(parsedLimit)
        ? Math.min(500, Math.max(1, parsedLimit))
        : 50;
      const fleetParam = url.searchParams.get('fleet');
      const fleet = fleetParam && /^[A-Za-z0-9_-]{1,32}$/.test(fleetParam) ? fleetParam : null;
      let query = 'SELECT * FROM log_events';
      const params: unknown[] = [];
      if (fleet) {
        query += ' WHERE fleet = ?';
        params.push(fleet);
      }
      query += ' ORDER BY ts DESC LIMIT ?';
      params.push(limit);

      const results = await env.DB.prepare(query).bind(...params).all();
      return Response.json(results.results);
    }

    return new Response('Not Found', { status: 404 });
  },
};
