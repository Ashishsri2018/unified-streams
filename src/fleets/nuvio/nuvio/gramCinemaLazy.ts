const GENLINK_HOST = 'tga-hd.api.hashhackers.com';
const GENLINK_PATH = '/genLink';
const SYNTHETIC_CDN_HOST = 'cdn1.apranet.eu.org';
const FILE_ID_PATTERN = /^[A-Za-z0-9_-]{6,200}$/;

function requestUrl(input: Parameters<typeof fetch>[0]): string | null {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input === 'object' && 'url' in input) return input.url;
  return null;
}

/**
 * GramCinema's provider resolves every candidate through `genLink` while
 * listing streams. That endpoint has a 100/day account limit, so a handful of
 * list requests can exhaust playback. Return a synthetic CDN URL instead; the
 * gateway rewrites it to `/proxy/gramcinema/<id>` and calls `genLink` only when
 * the user actually plays the link.
 */
export function gramCinemaLazyFetch(
  input: Parameters<typeof fetch>[0],
): Response | null {
  const rawUrl = requestUrl(input);
  if (!rawUrl) return null;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.hostname !== GENLINK_HOST) return null;
  if (url.pathname !== GENLINK_PATH) return null;
  if (url.searchParams.get('type') !== 'mix_media') return null;

  const fileId = url.searchParams.get('id') ?? '';
  if (!FILE_ID_PATTERN.test(fileId)) return null;

  const syntheticUrl = `https://${SYNTHETIC_CDN_HOST}/dl/${encodeURIComponent(fileId)}/lazy.mkv`;
  return new Response(JSON.stringify({ success: true, url: syntheticUrl }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
