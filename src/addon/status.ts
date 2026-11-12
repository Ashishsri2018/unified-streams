import type { Request, Response } from 'express';
import { StreamHandlerContext } from './stream.js';
import { buildHealthReport } from './health.js';
import { getPublicBaseUrl } from './configure.js';

export async function handleStatusPage(
  req: Request,
  res: Response,
  ctx: StreamHandlerContext,
  startedAt: number,
  configuredPublicUrl?: string,
): Promise<void> {
  const baseUrl = getPublicBaseUrl(req, configuredPublicUrl);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:;");
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }

  const report = await buildHealthReport(ctx, startedAt);
  const statusColor = report.status === 'ok' ? '#10b981' : report.status === 'degraded' ? '#f59e0b' : '#ef4444';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unified Streams — Status</title>
  <link rel="icon" type="image/x-icon" href="${baseUrl}/favicon.ico">
  <style>
    body { background: #0f172a; color: #f8fafc; font-family: -apple-system, sans-serif; padding: 2rem 1rem; }
    .container { max-width: 680px; margin: 0 auto; }
    .badge { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: bold; background: ${statusColor}; color: #fff; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 1.25rem; margin-top: 1rem; }
    pre { background: #0b1020; padding: 0.75rem; border-radius: 6px; overflow-x: auto; font-size: 0.85rem; color: #94a3b8; }
    h2 { font-size: 1.1rem; margin-bottom: 0.5rem; color: #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Unified Streams Status <span class="badge">${report.status.toUpperCase()}</span></h1>
    <p>Version: ${report.version} | Uptime: ${report.uptimeSec}s</p>

    <div class="card">
      <h2>Fleets</h2>
      <pre>${JSON.stringify(report.fleets, null, 2)}</pre>
    </div>

    <div class="card">
      <h2>Gateway Stream Cache</h2>
      <pre>${JSON.stringify(report.cache.stream, null, 2)}</pre>
    </div>

    <div class="card">
      <h2>Log Sink Health</h2>
      <pre>${JSON.stringify(report.sink, null, 2)}</pre>
    </div>
  </div>
</body>
</html>`;

  res.status(200).send(html);
}
