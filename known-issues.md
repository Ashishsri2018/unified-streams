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

Status: unresolved by design; stripping query strings would collapse legitimate
distinct URLs that use query parameters for resource selection.

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
