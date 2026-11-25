# Manifest-Only Proxy Plan (local planning doc, gitignored)

Status: planning only. Nothing in this document is implemented yet.
Last updated: 2026-11-24

## 1. Why

Rynara/Vidy streams are emitted with signed manifest URLs. Some of those
manifests are bound to the IP that requested the source list (the Railway
gateway/worker egress). The player fetches the manifest from the user's IP and
gets HTTP 403. Media segments are usually on a different, public CDN and are not
IP-bound.

Verified behavior (2026-11-24):

| Upstream host | Cities | Manifest from local IP | Media segments from local IP | IP-bound? |
| --- | --- | --- | --- | --- |
| `moon.goldenkite.top` | Miami, Boise | 403 even with Referer/UA/Origin; 200 from Railway | absolute on `laserlamp.top` / `nobleoffer.top`; 206 with **no headers** | Yes (manifest only) |
| `sun2.warmsquare.top` | Phoenix, Atlanta | 403 with Referer; 200 from Railway | same host; 200 **only** with `Referer: https://www.vidy.st/` | Yes (manifest only) |
| `sun1.warmsquare.top` | Munich, Berlin | 200 from local with Referer | 206 with Referer | No |
| `white-tooth-*.workers.dev` | Reno | 200 from local with Referer | 200 with Referer | No |

Other verified facts:

- `sun2` segments reject `Origin`/`User-Agent` alone; Referer is strictly required.
- No AES key tags in the moon/sun2 manifests. Moon has `#EXT-X-MAP` (init) on a
  public CDN. Only `.m3u8` playlists need proxying.
- Manifest fetch from Railway was stable 5/5 (200). Railway egress observed:
  `152.55.181.249`.
- `sun1` and Reno already work via the provider's `proxyHeaders` (Referer),
  which is why Reno works from a local IP.
- The Cloudflare settings worker (`cloudflare/ingest-worker`) stores the settings
  blob under a fixed key (`provider_overrides`) and treats it as opaque JSON.
  Adding a `manifestProxy` section to the same blob needs **no** Cloudflare
  worker or D1 migration change.

## 2. Goal and scope

Goal: make IP-bound manifests playable without routing video bytes through the
gateway.

- Proxy only the playlist (`.m3u8`), not media segments.
- Run the manifest fetch on the Railway gateway so it shares the worker egress IP.
- Apply to IP-bound hosts first: `moon.goldenkite.top`, `sun2.warmsquare.top`.
- Keep `sun1` and Reno unchanged (they already work with Referer).
- Make the allowlist admin-configurable from `/admin` with persistent storage.
- Defer full media proxying; design hooks so it can be added later.

Out of scope for this phase:

- Full media/segment proxy mode (planned future, see section 11).
- Other providers (i-arch, etc.) until their segment binding is tested.
- Per-user/client rate limiting (must not be added per AGENTS).

## 3. Recommended decisions (adopted)

1. Manifest-only proxy, hosted in the Railway gateway. A Cloudflare Worker
   cannot fetch the IP-bound manifest because its egress IP differs.
2. Default-enabled entries for `moon.goldenkite.top` and
   `sun2.warmsquare.top`; `sun1`/Reno left alone.
3. Nuvio is the primary target. Sun2 segments need Referer; verify that Nuvio
   still sends Referer to `sun2` segment requests after the stream URL host is
   rewritten to the gateway. If it does not, fall back to disabling sun2 or to
   the future full-proxy mode for sun2 only.
4. Add `MANIFEST_PROXY_SECRET` env (recommended 32+ random chars). Fallback
   order: `MANIFEST_PROXY_SECRET` -> `INTERNAL_TOKEN` -> `ADMIN_TOKEN` ->
   per-process random with a warning. Production must set it explicitly so all
   replicas share the same secret.
5. Admin-configurable entries, persisted locally and backed up in the existing
   Cloudflare D1 settings blob (same key, additive `manifestProxy` section).
6. Public route: `GET/HEAD /proxy/manifest?t=<token>`. OPTIONS is already global;
   other methods already fall through to the 405 handler.
7. Rewrite stream URLs **after** dedupe. Dedupe must see the original signed
   URLs so existing canonicalization still collapses rotated signatures.
8. Keep `behaviorHints` (including `proxyHeaders` and `notWebReady`) unchanged
   when rewriting the URL.

## 4. Architecture

```
Player
  |  GET https://gateway/proxy/manifest?t=<signed token>
  v
Railway gateway (same egress as workers)
  |  verify token, look up current allowlist entry
  |  GET upstream m3u8 with server-side Referer/Origin/UA
  v
IP-bound manifest host (moon / sun2)
  |
  |  gateway rewrites playlist URIs only
  v
Player receives m3u8 with:
  - child playlists  -> https://gateway/proxy/manifest?t=...
  - media segments   -> absolute upstream CDN URLs (direct)
  v
Player fetches segments directly from CDN
  - moon: no headers required
  - sun2: requires Referer (client must send proxyHeaders)
```

The gateway is the only component that needs the IP-bound egress.

## 5. Components

### 5.1 New module: `src/addon/manifestProxy.ts`

Responsibilities:

- `signManifestProxyToken(upstreamUrl, secret, ttlMs): string`
- `verifyManifestProxyToken(token, secret): { url, exp } | null`
- `rewriteManifest(text, upstreamUrl, baseUrl, secret, ttlMs): string`
- `handleManifestProxyRoute(req, res, ctx)`
- validation helpers and the built-in default entry list.

Token format:

```
base64url(JSON({ u: upstreamUrl, e: expiryEpochMs })) + "." + base64url(HMAC-SHA256(body))
```

- HMAC from `node:crypto` (`createHmac`, `timingSafeEqual`).
- Default TTL 6h (must exceed the 180s stream cache and normal playback start).
- Token contains the full upstream URL because the upstream signature is
  required. Expect proxy URLs around 1.5-2 KB. Stateless; no server-side store.
- On verify: constant-time signature check, expiry check, then re-check the URL
  against the **current** allowlist. Removing/disabling an entry rejects old
  tokens immediately.

Upstream fetch:

- `https:` only.
- Hostname must match an enabled entry (exact host or URL prefix match).
- Server-side headers from the entry only. Never accept headers from the token
  or query string.
- `AbortController` timeout ~8s.
- Body cap ~2 MB (manifests observed up to ~330 KB).
- `redirect: 'manual'`; follow at most 3 hops, validating every `Location`
  against the allowlist. Reject off-list redirects.
- Accept only HLS: content-type `application/vnd.apple.mpegurl`,
  `application/x-mpegURL`, `audio/mpegurl`, `text/plain`, or body beginning with
  `#EXTM3U`.
- Block private/loopback/link-local IP literals and `localhost`/`.local`
  hostnames. Best-effort DNS check before fetch (documented TOCTOU caveat; admin
  is trusted, but validation still applies).

HLS rewrite rules:

- Normalize CRLF.
- Resolve every URI against the **upstream** playlist URL (critical for sun2's
  relative paths). Never resolve against the gateway URL.
- Proxy only playlist URIs:
  - URI on the line after `#EXT-X-STREAM-INF`.
  - Inline `URI="..."` on `#EXT-X-MEDIA`, `#EXT-X-I-FRAME-STREAM-INF`,
    `#EXT-X-RENDITION-REPORT`.
  - Any URI whose pathname ends with `.m3u8`/`.m3u`.
- Leave everything else as an absolute upstream URL (media segments,
  `#EXT-X-MAP` init, future keys, parts).
- Preserve tags, comments, ordering, and attributes.
- Each proxied child playlist is signed with the same TTL.

Response:

- `Content-Type: application/vnd.apple.mpegurl`
- `Cache-Control: no-store`
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`
- `Access-Control-Allow-Headers: *`
- Do not forward upstream `Set-Cookie`, `Content-Encoding`, `Content-Length`.
- `HEAD`: verify token, fetch upstream (manifest is small), return status and
  content-type with no body. This keeps HEAD consistent with GET.
- Errors: 400 missing token, 403 invalid/expired/not-allowed, 502 upstream
  failure, 504 timeout. Do not return upstream bodies.
- Log host, status, duration, and a short token hash. Never log full URLs or
  query strings.

### 5.2 Config model and store: `src/core/manifestProxyConfig.ts`

Data model (per entry):

```ts
interface ManifestProxyEntry {
  id: string;                 // stable slug
  match: string;              // https URL prefix, e.g. "https://moon.goldenkite.top/"
  mode: 'manifest';           // 'full' reserved for the future
  enabled: boolean;
  headers: Record<string, string>; // Referer, Origin, User-Agent, ...
  createdAt: string;
  updatedAt: string;
}
```

- Matching: normalize entries to an `https:` origin/prefix. A stream URL matches
  if it starts with the entry prefix (host-level by default). Longest prefix
  wins if multiple match.
- Validation (Zod):
  - `https:` only; no credentials; standard port; max URL length 2048.
  - Reject private/loopback/link-local IP literals and `localhost`/`.local`.
  - Header names/values: max 20 headers, names restricted to a safe token set,
    values length-limited, no CRLF.
  - Max 50 entries.
- Defaults (built-in, merged with admin entries):
  - `https://moon.goldenkite.top/` with Vidy Referer/Origin/UA.
  - `https://sun2.warmsquare.top/` with Vidy Referer/Origin/UA.
  - Admin can disable a default or add more entries.
- Persistence:
  - Local file `DATA_DIR/manifest-proxy.json` with `{ version, updatedAt, entries }`.
  - Extend the existing Cloudflare settings blob with an optional
    `manifestProxy` section. The existing blob becomes:
    ```json
    {
      "version": 0,
      "updatedAt": "...",
      "fleets": { "sa7": {}, "nuvio": {}, "vega": {} },
      "manifestProxy": { "version": 0, "updatedAt": "...", "entries": [] }
    }
    ```
  - Backward compatible: old blobs have no `manifestProxy`; provider override
    parsing ignores the extra key (Zod strips unknown keys). Parse the proxy
    section separately.
  - No Cloudflare worker or D1 migration change; the settings key stays
    `provider_overrides` (legacy name) and the worker treats the blob as opaque.
  - Startup: load local file; if `CLOUDFLARE_SETTINGS_ENDPOINT` is configured,
    prefer the D1 snapshot for both sections, as today.
- Config versioning:
  - Own `version` counter, independent of provider overrides.
  - Include the proxy config version in the stream cache key and clear
    `ctx.cache` on every admin change (defense in depth).

### 5.3 Gateway wiring

- `StreamHandlerContext` additions:
  - `manifestProxy?: { secret: string; ttlMs: number; store: ManifestProxyStore }`
- `src/index.ts`:
  - Parse `MANIFEST_PROXY_SECRET`/TTL from env.
  - Create/load the store (local + D1 snapshot).
  - Pass it into the gateway context.
- `src/addon/app.ts`:
  - Register `GET/HEAD /proxy/manifest`.
- `src/addon/stream.ts`:
  - Compute `baseUrl` with `getPublicBaseUrl(req, ctx.publicBaseUrl)`.
  - Pass `{ baseUrl, secret, ttlMs, store }` into `mergeAndFilterStreams`.
- `src/addon/merge.ts`:
  - Add an optional final pass after dedupe/filter/sort/slice.
  - For each stream with a `url` (not `externalUrl`), if the URL matches an
    enabled entry with `mode === 'manifest'`, replace it with
    `${baseUrl}/proxy/manifest?t=${token}`.
  - Preserve `name`, `title`, `description`, `behaviorHints`, `drm`,
    `subtitles`, etc.
  - Do not rewrite archives, direct media, or non-matching hosts.

### 5.4 Admin page

- New "Manifest proxy" section on `/admin`:
  - Table: match URL, mode, headers summary, enabled toggle, remove.
  - Add form: URL (required), Referer, Origin, User-Agent (optional), Add.
  - Helper text: "Manifest mode proxies only .m3u8 playlists. Media segments
    load directly from the upstream CDN."
  - Mode selector omitted for now; `mode` is fixed to `manifest`. A disabled
    `full` option can be shown as "coming soon" later.
- New authenticated endpoints:
  - `GET /admin/api/manifest-proxy` -> entries + version.
  - `POST /admin/api/manifest-proxy/add`
  - `POST /admin/api/manifest-proxy/remove`
  - `POST /admin/api/manifest-proxy/toggle`
  - All POSTs use the existing `sameOrigin` check and JSON body limit.
- On any change:
  - Validate, persist locally, bump the proxy config version, clear `ctx.cache`.
  - Log a redacted event (`admin.manifest_proxy_*`).
- Remote backup:
  - Reuse `/admin/api/providers/save` to push the combined blob (provider
    overrides + manifest proxy). Alternatively add `/admin/api/settings/save`.
  - Keep the existing UX: changes apply immediately; "Save to Cloudflare" backs
    up to D1.
- Multi-replica caveat: other replicas only see remote changes on restart, same
  as provider overrides today. Document this.

## 6. Sun2 caveat (must validate)

Sun2 media segments require Referer. After rewriting the stream URL to the
gateway host, the client must still send `Referer: https://www.vidy.st/` to
`sun2.warmsquare.top` segment requests.

- Nuvio honors `behaviorHints.proxyHeaders` and works for Reno (same-host
  segments). Cross-host behavior after URL rewrite is unverified.
- Validation step: play a Phoenix/Atlanta stream in Nuvio with the proxy enabled.
  If segments 403:
  - Option A: disable sun2 entries (moon still works).
  - Option B: use the future full-proxy mode for sun2 only.
  - Option C: investigate a client-side header mechanism for cross-host
    segments (none known today).

Do not ship sun2 as "fixed" until this is tested.

## 7. Cache interaction

- Stream lists are cached for 180s (30s partial) and the cache key includes
  `policyVersion` and `addonVersion`.
- Add the manifest proxy config version to the cache key, and clear the cache on
  admin changes.
- Proxy tokens default to 6h. They must outlive the 180s cache window and
  reasonable playback start. The upstream signed URL may expire sooner; the
  proxy cannot refresh it. Players can re-request streams to get a fresh URL.
- Manifest responses are `no-store`; never cache them.

## 8. Files

New:

- `src/addon/manifestProxy.ts` - token, rewrite, route handler, defaults.
- `src/core/manifestProxyConfig.ts` - store, schema, matching, validation.
- `tests/features/manifestProxy.test.ts`
- `tests/features/manifestProxyConfig.test.ts`

Modified:

- `src/core/env.ts` - `MANIFEST_PROXY_SECRET`, `MANIFEST_PROXY_TOKEN_TTL_MS`.
- `src/index.ts` - construct store, pass secret/ttl/store in ctx.
- `src/addon/stream.ts` - context type, pass proxy options to merge.
- `src/addon/merge.ts` - post-dedupe URL rewrite.
- `src/addon/app.ts` - register `/proxy/manifest`.
- `src/addon/admin.ts` - proxy config endpoints + combined save.
- `src/addon/adminHtml.ts` - manifest proxy UI section and JS.
- `src/core/remoteSettings.ts` - widen the settings type to the combined blob.
- `config/defaults.env` / `.env.example` - document new env vars (no secrets).
- `known-issues.md` - replace the Rynara IP-bound entry with the proxy behavior
  and the sun2 Referer caveat.
- `memory.md` - session log.

## 9. Testing

Unit:

- Token sign/verify: valid, tampered body, tampered signature, expired, malformed.
- Allowlist: allowed host, disallowed host, disabled entry, prefix match,
  longest-prefix wins, URL with credentials/port/private IP rejected.
- Rewrite: master playlist (`#EXT-X-MEDIA` + `#EXT-X-STREAM-INF`), media playlist
  with absolute segments (moon), relative segments (sun2), `#EXT-X-MAP` left
  direct, `#EXT-X-KEY` left direct, CRLF, comments preserved, child playlists
  signed.
- Upstream: non-200, timeout, oversized body, non-HLS content, redirect to
  allowlisted host, redirect to disallowed host.
- Response headers: no-store, CORS, content-type.

Integration:

- `GET /proxy/manifest` with a valid token (mock `fetch`).
- `HEAD` returns status without body.
- `OPTIONS` 204; `POST` 405; missing token 400; invalid/expired token 403.
- Admin endpoints: add/remove/toggle, validation errors, persistence, cache
  clear, combined save payload.
- Merge: matching URL rewritten, non-matching untouched, dedupe still collapses
  rotated signatures, `proxyHeaders`/`notWebReady` preserved, `externalUrl`
  untouched.

Commands allowed locally:

```
npm run lint
npm run typecheck
npm run test:feature
npx vitest run tests/features/manifestProxy.test.ts
```

Do not run `npm run build` or `npm run verify` locally (CI only).

## 10. Verification

Local (no Railway egress needed):

- Temporarily add a `sun1.warmsquare.top` entry (Referer-only) in a test config.
- Start the gateway locally, generate a token via the admin API or a test helper,
  fetch `/proxy/manifest`, confirm:
  - master -> child playlists are proxy URLs,
  - media playlist -> segments are absolute `sun1` URLs,
  - direct segment fetch with Referer returns 206.
- This validates token, rewrite, route, and headers without IP binding.

Railway (requires deploy; do not deploy without explicit approval):

- Play a moon (Miami/Boise) stream from a non-Railway IP. Manifest should load
  through the gateway; segments should load directly from `laserlamp.top` /
  `nobleoffer.top` with no headers.
- Play a sun2 (Phoenix/Atlanta) stream in Nuvio. Manifest should load through
  the gateway; segments should load if the client forwards Referer (section 6).
- Watch logs for upstream 403s and egress instability.

## 11. Future: full proxy option (feasibility only, not planned yet)

Question: "admin enters URLs, those get rewritten for full proxy - will this
work?"

Yes, the same admin entry model can drive a full proxy later. Reuse:

- The same signed token and allowlist.
- The same manifest rewrite, but also rewrite media segment URIs to a proxy URL.
- A `mode: 'full'` flag per entry.

What full proxy additionally needs:

- Streaming passthrough (pipe `response.body`, never buffer) to avoid memory and
  timeout issues.
- `Range` request/response forwarding for seeking; `206` support.
- Longer timeouts and connection lifetime; no response caching.
- Bandwidth and cost planning. Routing all video through Railway is expensive;
  prefer a Cloudflare Worker for the media leg where segments are not IP-bound
  (e.g., sun2, which only needs Referer). The manifest leg must stay on Railway
  for IP-bound hosts.
- The existing `/root/iptv/iptv-proxy-worker` (Cloudflare) already implements a
  media proxy with a waterfall; it could be reused for the segment leg, but the
  manifest leg still needs Railway.
- Per-entry headers and allowlist are already in place.
- Do not use full proxy for moon unless necessary: its segments are public and
  manifest-only already fixes playback.

Recommendation: ship manifest-only first; add full mode only if a client cannot
send Referer to sun2 segments (or for future IP-bound segment hosts).

## 12. Risks and mitigations

- Railway egress IP rotation or multiple egress IPs: could cause intermittent
  403 on IP-bound manifests. Mitigate with one retry and logging; if persistent,
  consider a static-egress proxy.
- Sun2 cross-host Referer after rewrite: validate in Nuvio; fallback to disable
  sun2 or full proxy for sun2.
- Upstream manifest token expiry: proxy cannot refresh; players re-request
  streams. Token TTL does not extend upstream validity.
- Long proxy URLs: stateless token includes the full upstream URL. Acceptable;
  if a player rejects long URLs, consider a short-id store (adds state).
- SSRF via admin entries: admin is trusted, but validate https, block
  private/loopback hosts, validate redirects, cap size/time.
- Multiple replicas: shared `MANIFEST_PROXY_SECRET` required; remote config is
  reloaded only at startup (same as provider overrides today).
- Cloudflare settings blob shape change: additive and backward compatible; the
  legacy key name `provider_overrides` remains.
- Header leakage: only server-side entry headers are sent upstream; never
  forward client headers, cookies, or auth.
- Cache staleness: include proxy config version in the cache key and clear the
  cache on admin changes.

## 13. Rollout and rollback

Rollout:

1. Implement module, config store, route, merge rewrite, admin UI, tests, docs.
2. Enable default entries for moon and sun2.
3. Validate moon end-to-end on Railway.
4. Validate sun2 in Nuvio; keep or disable based on the Referer result.
5. Add future entries (other providers) after testing their segment binding.

Rollback:

- Disable or remove entries in `/admin` (immediate; old tokens rejected).
- Remove default entries in code if a permanent rollback is needed.
- Clearing the cache after changes ensures new stream lists stop using removed
  entries.

## 14. Open decisions

Recommended defaults are marked.

1. Include sun2 in the first release? (Recommended: yes, but ship only after the
   Nuvio cross-host Referer test; otherwise disable sun2 and keep moon.)
2. Require `MANIFEST_PROXY_SECRET` in production? (Recommended: yes; fallback
   only for local/dev.)
3. Reuse the existing Cloudflare settings key/blob for proxy config?
   (Recommended: yes; additive `manifestProxy` section, no CF change.)
4. Admin UI scope for this phase: add/remove/toggle + headers, mode fixed to
   `manifest`. (Recommended.)
5. Defaults + admin entries merge model with admin-disable for defaults.
   (Recommended.)
6. Route name `/proxy/manifest`. (Recommended.)
7. Token TTL default 6h. (Recommended.)
