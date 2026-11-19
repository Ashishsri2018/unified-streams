const DEFAULT_ORIGIN = 'http://203-188-173-134.sslip.io:7000';

export default {
  async fetch(req, env) {
    const incoming = new URL(req.url);
    const origin = (env.ORIGIN || DEFAULT_ORIGIN).replace(/\/+$/, '');
    const target = new URL(`${origin}${incoming.pathname}${incoming.search}`);

    const headers = new Headers(req.headers);
    headers.set('X-Forwarded-Proto', 'https');
    headers.set('X-Forwarded-Host', incoming.host);
    headers.set('X-Forwarded-For', req.headers.get('CF-Connecting-IP') || '');
    headers.set('Accept-Encoding', 'identity');
    headers.delete('Host');

    const init = {
      method: req.method,
      headers,
      redirect: 'manual',
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = req.body;
    }

    let response;
    try {
      response = await fetch(target.toString(), init);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Response.json({ streams: [], error: message }, { status: 502 });
    }

    const outHeaders = new Headers(response.headers);
    if (!outHeaders.has('Access-Control-Allow-Origin')) {
      outHeaders.set('Access-Control-Allow-Origin', '*');
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: outHeaders,
    });
  },
};
