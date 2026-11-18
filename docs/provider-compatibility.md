# Provider Compatibility Guide: Railway vs Beamup

**Date:** 2026-11-14 (point-in-time benchmark; provider availability changes over time)
**Scope:** 2 Movies (*Fight Club*, *Interstellar*), 2 Series (*Breaking Bad* S01E01, *Stranger Things* S01E01), 2 Anime (*Attack on Titan* S01E01, *Death Note* S01E01).

This is the canonical benchmark report. Live health data should be read from `/health` and `/status`.

## 1. Summary

- **Railway Production:** 653 total streams across 6 titles (108.8/title).
- **Docker Beamup:** 407 total streams across 6 titles (67.8/title), i.e. **+60.4% on Railway**.
- 39 distinct providers yielded streams; SA7 is identical on both platforms.

### Target-by-target

| Title | ID | Railway | Beamup | Notes |
| :--- | :--- | :---: | :---: | :--- |
| Fight Club | `tt0137523` | 110 (13.4s) | 105 (16.7s) | +5 Railway |
| Interstellar | `tt0816692` | 99 (18.0s) | 65 (11.6s) | +34 Railway |
| Breaking Bad S01E01 | `tt0903747:1:1` | 143 (20.0s) | 54 (12.0s) | +89 Railway |
| Stranger Things S01E01 | `tt4574334:1:1` | 89 (26.4s) | 66 (12.7s) | +23 Railway |
| Attack on Titan S01E01 | `tt2560140:1:1` | 74 (26.4s) | 76 (17.3s) | +2 Beamup, 9.1s faster |
| Death Note S01E01 | `tt0877057:1:1` | 138 (26.5s) | 41 (12.7s) | +97 Railway |

**Core cause:** Vega and Nuvio scrapers frequently hit Cloudflare Turnstile, browser challenges, or IP bans from shared community egress, while succeeding from Railway's dedicated `sin1` datacenter. Beamup's ~14s proxy cut-off also truncates slow scrapers (e.g. `maelith`, avg 10.9s).

## 2. Platform Compatibility Tiers

### Tier 1 — Work on both (18)

| Fleet | Provider | Railway | Beamup |
| :--- | :--- | :---: | :---: |
| SA7 | RedFlix | 60 | 60 |
| SA7 | MultiMovies | 55 | 55 |
| Nuvio | Tyvrel. | 32 | 32 |
| Nuvio | Esvyl. | 31 | 31 |
| SA7 | ToonStream | 28 | 28 |
| Vega | MovieBox Web | 23 | 23 |
| SA7 | DesiFlix | 13 | 13 |
| Nuvio | Quinox. | 8 | 13 |
| SA7 | VidRock | 9 | 9 |
| SA7 | NetMirror | 8 | 8 |
| Vega | Castle TV | 8 | 8 |
| SA7 | Movix VF | 6 | 6 |
| Nuvio | Haylox. | 6 | 6 |
| Vega | 1Flex | 5 | 6 |
| Nuvio | Fendrix. | 5 | 5 |
| Vega | MoviezWap | 3 | 3 |
| Vega | AnimeSalt | 1 | 1 |
| SA7 | TopCartoons | 1 | 1 |

### Tier 2 — Railway only (17; disabled on Beamup)

| Fleet | Provider | Scraper ID | Railway | Beamup | Failure on Beamup |
| :--- | :--- | :--- | :---: | :---: | :--- |
| Vega | 4khdHub | `4khdhub` | 152 | 29 | Cloudflare Turnstile / rate limit |
| Vega | MultiStream | `autoEmbed` | 30 | 2 | Cinejoy extraction fails |
| Vega | ShowBox | `showbox` | 23 | 0 | Blocked / no streams |
| Vega | HdHub4u | `hdhub4u` | 20 | 0 | Immediate IP rejection |
| Vega | VMovies | `vega` | 9 | 0 | Returns empty |
| Nuvio | Fjoral. | `fjoral` | 32 | 0 | Mirror connection blocked |
| Nuvio | Xylos. | `xylos` | 18 | 0 | Egress IP rejected |
| Nuvio | Maelith. | `maelith` | 18 | 8 | Exceeds 11s worker deadline |
| Nuvio | Xandril. | `xandril` | 14 | 0 | Blocked |
| Nuvio | Vitrix. | `vitrix` | 8 | 0 | Blocked |
| Nuvio | Ozeris. | `ozeris` | 7 | 0 | Blocked |
| Nuvio | Ilvyrel. | `ilvyrel` | 6 | 0 | Blocked |
| Nuvio | Solunix. | `solunix` | 5 | 0 | Blocked |
| Nuvio | Qorva. | `qorva` | 3 | 0 | Blocked |
| Nuvio | Lenyr. | `lenyr` | 2 | 0 | Blocked |
| Nuvio | Phraxis. | `phraxis` | 2 | 0 | Blocked |
| Nuvio | Praxiel. | `praxiel` | 2 | 0 | Blocked |

### Tier 3 — Beamup only (4)

| Fleet | Provider | Scraper ID | Railway | Beamup |
| :--- | :--- | :--- | :---: | :---: |
| Vega | AnimeWorld | `animeworld` | 0 | 35 |
| Vega | Movies4U | `movies4u` | 0 | 10 |
| Nuvio | Sylphera. | `sylphera` | 0 | 8 |
| Vega | RogMovies | `rogmovies` / `luxMovies` | 0 | 7 |

### Tier 4 — 0 streams on both

- **SA7:** `dahmermovies`, `dahmermovies-tv`, `einthusan`, `kurage`, `playimdb`, `puretoons`.
- **Nuvio:** `jyniq`, `kethrax`, `kryxalia`, `lyrin`, `noctyx`, `novus`, `nyxora`, `onyxia`, `rylvane`, `svartok`, `vyranel`, `waelum`, `wrenok`.
- **Vega:** `anikoto`, `animesub`, `dramacool`, `drive`, `eonMovies`, `everything`, `gokuHD`, `kickAssAnime`, `kissKh`, `kmMovies`, `luxMovies`, `mod` (403 on series), `movielinkdb`, `mxplayer`, `rareanimes`, `zeefliz`.

These are mostly catalog/genre specialization (anime, Bollywood, Asian drama, live TV) or dead/changed upstreams — not necessarily broken scrapers. Verify with an in-catalog title before disabling.

## 3. Takeaways

1. **SA7 is stable everywhere** — 100% identical results for its major providers.
2. **Clean egress wins for Vega/Nuvio** — dedicated cloud IPs yield far more streams than shared community hosting.
3. **Beamup favors anime** — `AnimeWorld`, `ToonStream`, and `Sylphera.` match or beat Railway on anime titles.

## 4. Configuration Enforcement

Per-instance provider selection is canonical in `config/providers.json` (`instances.<profile>` blocks), with timeouts in `config/instances/<profile>.env`; CI sets only `INSTANCE_PROFILE` plus credentials. Runtime `*_ENABLED_*` / `*_DISABLED_*` variables are per-run overrides, not the source of truth. All profiles use deny lists so new upstream providers are enabled automatically; hard-disabled classes (YouTube, torrent scrapers, Internet Archive, BDIX, live TV) cannot be re-enabled by a profile. On Railway, Nuvio is the primary fleet and duplicate providers in Vega/SA7 are disabled. `mxplayer` is denied on Railway but allowed on Beamup. See [architecture.md](../architecture.md) for the current routing table.
