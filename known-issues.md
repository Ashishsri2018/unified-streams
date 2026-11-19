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
