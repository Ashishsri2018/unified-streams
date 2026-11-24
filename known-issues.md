# Unified Streams Known Issues

Current, unresolved issues and limitations. Dates mark when an issue was recorded.

## Playback

### Vidlink (Haylox) MP4s return HTTP 428 in Nuvio ExoPlayer (2026-11-19)

Rick and Morty S2E8 (`tt1312171:2:8`) exposes direct links such as:

```
https://bcdn.hakunaymatata.com/resource/h265/1ca2c95ac4ba6d30a5a084eb606a6eae.mp4?sign=...&t=...
```

Nuvio (ExoPlayer) reports `HTTP 428`; Nuvio with libmpv was also reported as failing.

Root cause is the `User-Agent`, not the signed URL. `bcdn.hakunaymatata.com`
returns **428 Forbidden** (nginx) for any UA beginning with `Mozilla/5.0`, and
**200/206** (Tengine) for non-browser UAs:

```
Mozilla/5.0 (Linux; Android 13; Pixel 7) ... Chrome/120 ...  -> 428
libmpv / mpv / ExoPlayerLib / okhttp / curl                 -> 206
```

The file itself is valid: MP4, H.265 Main 720p, AAC, ~22:32, `moov` at the
front, full range support, decodes cleanly. Changing `sign`/`t` or dropping
`t` returns 403, so the URL must be passed through unchanged.

The Nuvio Haylox provider (`haylox.js` -> `buildStream`) emits only
`{name,title,url,quality,type}` and no `headers`, so the addon response has no
`behaviorHints.proxyHeaders` for these links. Nuvio then uses its built-in
`DEFAULT_USER_AGENT` (`Mozilla/5.0 ... Chrome/120 ...`) for ExoPlayer, which
triggers the 428. libmpv receives no UA override and should send a non-Mozilla
UA, so this specific MP4 should play there; the libmpv failure seen in the same
session was the `vixsrc.to` 403 below.

Status: unresolved; no patch applied. Possible fixes:

- In `haylox.js`, attach a non-browser `User-Agent` (e.g. `okhttp/4.12.0` or
  `ExoPlayerLib/2.19.1`) for `bcdn.hakunaymatata.com` `.mp4` streams so
  `mapStreams` forwards it as `proxyHeaders.request`.
- Or in Nuvio, retry a 428 media response with a non-Mozilla UA.

Caveat if the provider file is patched on a deployed instance: the nuvio
snapshot updater replaces `/data/nuvio/<sha>/providers/*.js` from upstream every
20-24h, so a runtime-only edit is lost on refresh. Patch the addon mapping or
the client for a durable fix.

### VixSrc playlists return HTTP 403 (Cloudflare challenge) (2026-11-19)

The Kethrax/VixSrc stream for the same episode is a `vixsrc.to/playlist/...`
HLS URL. It returns `403` with `cf-mitigated: challenge` ("Just a moment...")
for every client, including ExoPlayer and libmpv. The token is not expired
(`expires=1800277130` -> 2027-01-18).

The addon already forwards the provider headers:

```json
"proxyHeaders": {
  "request": {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Referer": "https://vixsrc.to/"
  }
}
```

Those headers are not enough: Cloudflare requires a `cf_clearance` cookie from a
solved challenge. Playback needs a WebView/resolver that produces and reuses
those cookies, or a different source. Status: unresolved.

## Gateway filtering and deduplication

### Absolute episode numbering for long-running anime (2026-11-22)

Episode matching now accepts four-digit episode numbers (e.g. One Piece 1100+),
but providers that publish absolute episodes under a fixed `Season 1` label are
not treated as matching a later requested season. `matchesEpisode` rejects a
title whose explicit season differs, and the SA7 post-filter drops streams whose
filename/URL names another season. This prevents wrong-season streams, at the
cost of providers that label an absolute episode as `S01E1100` for a request
like `S21E1100`. Providers that omit the season (`Episode 1100`, `E1100`) still
match, and Vega uses the computed absolute episode for seasonless ranges.

### AniChan (Xandril) returns incorrect streams and false-matches non-anime (2026-11-21)

AniChan (`xandril` in Nuvio, scraping `https://anichan.to`) frequently returns streams for the wrong title, season, or episode.

Specific symptoms:
1. **False-positive matches on non-anime**: Live-action movies and Western TV series return anime streams. For example, *Moonlight* (TMDB 376867) returns *Sumikkogurashi: The Little Wizard in the Blue Moonlight*; *Invincible* (TMDB 95557) returns *I'm invincible* (Chinese donghua). Any title containing common words (*Monster*, *Drive*, *Alone*, *Hero*, *Kingdom*, *Solo*) risks falsely locking onto an anime title.
2. **Season and arc mismatches**: Western databases (TMDB / IMDb) number seasons sequentially (Season 1, Season 2, Season 3), whereas AniList / AniChan indexes each story arc as an independent anime entry. For multi-season anime like *Demon Slayer*, requesting Season 3 (*Swordsmith Village Arc*) matches Season 2 (*Entertainment District Arc*) because both share identical episode counts (11 episodes) and generic season keywords.
3. **Out-of-bounds episode fallbacks**: When specific season matching fails, the provider falls back to Season 1 and computes an absolute episode number (`abs = sum(prev_seasons) + ep`). If the Season 1 entry on AniChan only has 24 episodes, requesting episode 26+ produces out-of-bounds errors or plays unrelated specials/OVAs.

Root causes in `src/fleets/nuvio/snapshot/providers/xandril.js` & manifest:
- **No anime gating**: Registered with `supportedTypes: ["movie", "tv"]` in `src/fleets/nuvio/snapshot/manifest.json`. Without anime genre/origin detection, Nuvio fans out every single movie and series request to AniChan.
- **Overly permissive scoring**: `scoreCandidate` awards 60 points for any substring match (`a.includes(b) || b.includes(a)`). Added to same-year (+30) or movie format (+20) against a low 70-point threshold, common words match easily.
- **Loose season regex**: `SEASON_MARK` awards +10 to any candidate containing keywords (`season`, `2nd`, `3rd`, `part`, `final`) regardless of whether the season number matches.

Status: Unresolved; provider code unedited. Recommended non-provider mitigations include disabling `xandril` in `config/providers.json` (relying on other dedicated anime providers like `anizen`, `anizone`, `animesalt`, `kurage`, `animeworld`, `kickAssAnime`) or gating `xandril` at the fleet/gateway layer so it only runs when metadata confirms anime content.

### Torrent dedupe does not unify infoHash and magnet forms (2026-11-20)

`getStreamDedupeKey` in `src/addon/merge.ts` prefers the stream URL when one is
present and only falls back to `infoHash` + `fileIdx` when no URL exists. As a
result, the same torrent returned by one fleet as a bare `infoHash` stream and
by another as a `magnet:` URL produces different keys and is not deduplicated.

Current fleet mappers do not appear to emit both forms for the same stream, so
this is a latent issue. Status: unresolved.

Possible fix: when `infoHash` is present, use it as the primary key (including
`fileIdx`) and only use the URL key for non-torrent streams.

### Query-token-rotated URLs are not deduplicated (2026-11-20)

`normalizeStreamKey` in `src/core/urlClassifier.ts` lowercases the host and
removes fragments and trailing slashes, but intentionally preserves
`parsed.search`. Signed CDN URLs that differ only by rotated query tokens are
therefore treated as distinct streams and can duplicate across fleets.

Status: partially fixed (2026-11-24). `canonicalizeStreamKey` now strips rotated
signing params from the dedupe key only; `normalizeStreamKey` and the returned
stream URL are unchanged. Params that select content are preserved.

Update (2026-11-24): confirmed live on Railway; duplicates come from provider
fan-out, not a duplicated gateway query (each fleet worker is called once per
request and identical in-flight requests are coalesced).

- `Castle` (SA7) iterates every language track in `castle.js` (`getStreams`) and
  calls `getVideoV1` per track. When two tracks resolve to the same video, the
  same path is emitted twice. For `tt0816692` it returned
  `img1.hscow.com/hls_mps/7047.../720/index_287.m3u8` as both English and Hindi,
  with `Expires` one second apart.
- `VidRock` (Vega) returned a true duplicate for `VisionQuest` S1E1
  (`tt23112594:1:1`): identical title (`... 1080p ... Hindi Dub ... VidRock`),
  identical path, only `Expires`/`Signature` rotated (`...2418` vs `...2419`).
- Cross-provider same-file duplicates: `Castle`/`VidRock`/`Tyvrel` on
  `img1.hscow.com`; `MultiStream`/`1Flex`/`Rynara` on `goldenkite`/`warmsquare`.
- `Esvyl` shares one `dash-hls-bridge...workers.dev/` base across many entries,
  but the `url=` targets different DASH IDs (audio tracks), so those are not
  duplicates.
- `ShowBox` shares one `hls.shegu.net/40022144.m3u8` path across 4K/1080p/720p/360p
  labels with a different `sign` per quality. Verified distinct renditions: the
  URL carries `quality=4K|1080p|720p|360p`, so stripping `sign`/`t` keeps them
  separate.

Implemented mitigation (2026-11-24) in `canonicalizeStreamKey`
(`src/core/urlClassifier.ts`): the dedupe key drops only recognized signing
params — CloudFront (`Expires`, `Signature`, `KeyName`, `Policy`,
`Key-Pair-Id`), AWS SigV4 (`X-Amz-*`), febbox `sign`/`t` (when a companion
marker is present), and goldenkite-style `s` tokens matching
`s<n>.<ts>.<n>.<hash>`. All other params (e.g. `quality`, `q`, `url`, `token`)
are preserved and sorted. The URL sent to clients is never modified; the
surviving duplicate keeps its own valid signature.

Remaining gaps: generic `token`/`t`/`s` values that do not match these schemes
are left intact, so some rotated-token duplicates (e.g. JWT `?token=` URLs) still
survive. The underlying provider fan-out (Castle per-language, VidRock per-track)
still emits duplicates; the gateway now collapses the identical-path copies.

### One invalid filter field resets the entire user config (2026-11-20)

`decodeUserConfig` in `src/addon/userConfig.ts` parses the whole config with
`UserConfigSchema.safeParse`; if any field is invalid the function returns
`DEFAULT_USER_CONFIG`, discarding valid fields from the same config payload.
This can silently re-enable streams or resolution/size limits the user set.

Status: unresolved. Possible fix: validate fields individually and fall back per
field, or return a partially-applied config with warnings.

### External streams lose quality and size metadata (2026-11-20)

`normalizeStreamItem` in `src/addon/merge.ts` rebuilds external streams as
`{name, title, description, externalUrl, behaviorHints}`, dropping `quality`,
`size`, and other fields. Because filtering runs after normalization, size and
resolution filters see external/archive entries as having unknown metadata,
which can change which entries pass (especially when `includeUnknownSize` or
`includeUnknownRes` is disabled).

Status: unresolved. Possible fix: carry `quality` and `size` onto external
streams so filters can evaluate them consistently, or explicitly exempt
external streams from size/resolution filtering.

## Observability

### `yieldRate` is query-mix dependent (2026-11-22)

Provider `yieldRate` is `responded / calls` and only measures whether a provider
returned at least one stream for the requests it received. A low yield is not
the same as an unhealthy provider: providers are often queried for content they
do not carry (for example cartoons-only providers queried for standard movies),
and some empty results come from silent upstream failures caught as `[]`.
`responseRate` measures availability; use `yieldRate` as a usefulness signal,
not a health verdict.

## Provider patches (context)

### Zevran and Solunix parsing repaired (2026-11-19)

Earlier today, `src/fleets/nuvio/snapshot/providers/zevran.js` and
`src/fleets/nuvio/snapshot/providers/solunix.js` were patched in commit
`4a02aba` (`fix(nuvio): repair zevran and solunix provider parsing`).

- `zevran.js`: accepts the VAplayer payload variants `stream_urls`,
  `stream_url`, `cast_urls`, `urls`, and `sources` (array, string, or object),
  derives quality from `file_name`/`title` instead of hardcoding `1080p`, and
  reads subtitles from the payload.
- `solunix.js`: normalizes the Hicine detail response when it is an array or
  wrapped in `{ data: ... }` before reading `.links`.

Recorded for context; the parsing failures themselves are fixed. The fix is
committed locally, but the VPS deployment's git log does not include `4a02aba`
as of this note, so its runtime snapshot may still contain the old parsing
until the next deploy or snapshot refresh.

The Vidlink (Haylox) HTTP 428 issue above is separate and remains open; no
Vidlink patch has been applied.

## Isolation and deployment caveats (2026-11-22)

### Provider code runs in-process with worker privileges

Nuvio and Vega scraper/provider modules are evaluated inside the fleet worker
process, and all three fleets run in the gateway process tree. The loopback
worker split (`127.0.0.1:7001-7003`) isolates HTTP failure domains and stream
caches, but it is not a security sandbox: provider code can read `process.env`,
open files, or mutate globals. Treat provider snapshots as trusted code and
review them before enabling a new source.

Status: accepted architecture. A real sandbox would require a separate runtime
or VM boundary; it is out of scope for the current deployment.

### Cookie jar is shared per Vega worker

`CookieJar` now stores cookies by host (host-only cookies) or by the explicit
`Domain` attribute, and only sends `Secure` cookies over HTTPS. Cookies with a
shared parent domain are still visible to every provider served by the same
Vega worker, matching browser behavior for `Domain` cookies. There is no
per-provider partition.

Status: accepted. Provider modules are not mutually untrusted.

### Rollback workflow is a stub

`.github/workflows/rollback.yml` checks out the requested commit and only prints
a message; it does not redeploy Beamup, Railway, or Cloudflare. Use the normal
deploy workflow or the provider-specific CLIs for an actual rollback.

Status: unresolved by design; documented to avoid treating the workflow as a
real rollback mechanism.

### Log sink circuit breaker drops queued batches

When the Cloudflare log sink circuit is open, `CloudflareSink.writeBatch` throws
and `LogQueue` records `batchesFailed` and drops that batch. Gateway behavior is
unaffected, but log delivery is lossy during a sink outage.

Status: accepted; the circuit breaker protects request latency.

### Vega vendored baseline is a static seed

`src/fleets/vega/providers-baseline/Zenda-Cross/` is copied into `dist/` and
seeded into `DATA_DIR/vega/providers/Zenda-Cross` only when that directory is
absent. Runtime updates refresh `DATA_DIR`, not the committed baseline, so a
fresh deployment without a successful update starts from the vendored snapshot.
Re-vendor the baseline manually (manifest, urls, enabled provider dirs, and
`state.json`) when upstream adds providers or bumps versions. The baseline
intentionally omits providers whose manifest entry has `disabled: true`, matching
the updater's `raw.disabled !== false` filter.

Status: accepted; the runtime updater is the source of truth once it succeeds.

### HDHub4u download redirects can exceed SA7 worker memory

The SA7 `hdhub4u` provider follows hubcloud `/drive/t3dl.php?id=...` links that
redirect to direct R2 `.mkv` downloads (observed 2.4 GB for `Steps` 2026,
`tt14413964`). The upstream extractor calls `fetch(...).text()` on those
responses, so the entire file is buffered in memory and the worker is killed.
This crashed the Railway deployment because `sa7:hdhub4u` is active there; the
Beamup instance does not run the SA7 copy.

`src/fleets/sa7/lib/tracker.js` now rejects binary/archive content types,
media/archive redirect paths, and responses over 16 MiB before a provider can
read the body, and caps axios response bodies at the same limit. Guard errors
are recorded as failed network attempts so the provider skips the link instead
of aborting the request.

`src/fleets/nuvio/nuvio/loader.ts` applies the same 16 MiB / binary / media-path
guard to Nuvio provider fetches, including a streaming abort for chunked bodies
with no usable `content-length`. This covers the Beamup `nuvio:qyrvaen`
(HDHub4u) copy, whose provider passes `skipSizeCheck: true`; that option is a
different runtime's convention and was previously ignored here.

Status: mitigated. Keep the guard when refreshing the SA7 vendored snapshot;
the provider updater will overwrite `hdhub4u.js` but not this lib file.

### Vega cURL transport buffers before enforcing the response cap

`HttpTransport.curlRequest` calls `response.buffer()`
(`src/fleets/vega/providers/sdk/http.ts:486`) and only checks
`maxResponseBytes` after the whole body is already in memory. `curl-cffi-node`
is not a dependency, so `getCurlApi()` fails and the transport falls back to the
native fetch path, which streams and aborts at 32 MiB (`http.ts:573`). If cURL
support is enabled later, add a byte/size limit to the cURL helper options (or
stream and cancel the body) before buffering.

Status: latent; the native path is guarded.

### Missing-provider warnings only fire on manifest transitions

All fleets compare the outgoing manifest's provider IDs with the new manifest
and warn for configured IDs (enabled or disabled) that disappeared. This
catches upstream renames, e.g. `sylphera` being renamed, so
`config/providers.json` can be reconciled:

- Nuvio: `nuvio_providers_missing` from `SnapshotManager.activate`.
- Vega: `provider_missing` from `Updater.handleFullUpdate`, using the previous
  active snapshot's `manifest.json` (falling back to `state.providers` keys).
- SA7: `[providers] configured provider(s) missing from manifest: ...` from
  `buildRegistry`/`reloadProviders`.

Limitations: the warning needs a previous manifest in the same process. A cold
start where the cached/bundled snapshot already reflects the rename (and no
older manifest is loaded first) will not warn. SA7 and Nuvio compare in-memory
manifests, so a rename that happened before the process started is invisible to
them; Vega can use the previously installed manifest directory.

Status: accepted; covers the live refresh/update path used by deploys with a
warm disk or bundled snapshot.

### Provider new/updated badges are per-process (2026-11-24)

The `new` and `updated vX -> vY` badges in `/admin` compare provider versions
against the first snapshot activated in the current worker process. They reset on
restart and are not stored in D1 or `DATA_DIR`. If the first snapshot has no
entries, the next usable snapshot becomes the baseline and is not marked `new`.
A rename that happened before the process started remains visible only through
the missing-provider warning above.

Status: accepted; badges are informational and do not affect enablement.

## Cloudflare settings backup requires a D1 migration (Nov 24 2026)

The `/admin` `Save to Cloudflare` action and startup remote load use the
`app_settings` table added by
`cloudflare/migrations/0002_settings.sql`. Deploying the Worker alone does not
create the table. Until the migration is applied with `wrangler d1 execute`, the
Worker returns HTTP 500 for `/v1/settings`; the gateway logs a warning and falls
back to `DATA_DIR/provider-overrides.json`.

The remote snapshot is one global document. Multiple writable instances sharing
one D1 database will overwrite each other on Save (last write wins). Remote
settings take precedence over the local file at startup whenever a row exists,
including version 0.

Status: accepted; apply the migration and use one writer.

## Runtime provider admin limitations (Nov 23 2026)

- **Enablement requires `ADMIN_TOKEN`.** An empty or unset token keeps `/admin*` at 404. The panel is not rate limited per `AGENTS.md`; the token must still be long and random, and the login cookie is an HMAC-derived session (`HttpOnly`, `SameSite=Strict`) rather than the raw token.
- **Manifest-disabled providers stay disabled.** SA7/Nuvio/Vega treat upstream `enabled: false` as unavailable, so a runtime override cannot load a provider whose manifest entry is disabled.
- **Lazy load is best effort.** Enabling a provider loads its bundle from the active snapshot; a load failure is reported in the catalog (`lastError`) and does not fail the toggle. Disabling drops the bundle from the active snapshot but the underlying module cache for that snapshot is only fully released when the snapshot is replaced or the worker restarts.
- **Gateway fan-out failures still return HTTP 200 with empty streams.** Admin catalog/selection endpoints can return 502/503 when a worker or its catalog is unavailable.
- **Timeouts remain deploy-time.** The panel shows the effective values but does not change them. Runtime timeout edits would need the same versioned push/persist flow plus bounded Zod validation.
