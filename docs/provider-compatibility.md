# Provider Compatibility Guide: Railway vs Beamup

**Date:** 2026-11-14  
**Benchmark Scope:** 2 Movies (*Fight Club*, *Interstellar*), 2 Series (*Breaking Bad* S01E01, *Stranger Things* S01E01), 2 Anime (*Attack on Titan* S01E01, *Death Note* S01E01).

---

## 1. Summary of Platform Differences

- **Railway Production:** Yielded **653 total streams** across 6 titles (average 108.8 streams/title).
- **Docker Beamup:** Yielded **407 total streams** across 6 titles (average 67.8 streams/title).
- **Core Cause:** Scrapers in Vega and Nuvio frequently face Cloudflare Turnstile, browser challenges, or IP bans when executed from shared community hosting nodes (`baby-beamup.club`), while succeeding cleanly from dedicated cloud egress (`sin1` datacenter on Railway).

---

## 2. Platform Compatibility Lists

### 2.1 Tier 1: Providers that Work Well on BOTH Platforms (18 Providers)
These providers exhibit **100% or near-identical parity** across both platforms, with zero network blocking:

| Fleet | Provider Name | Railway Streams | Beamup Streams | Content Category & Features |
| :--- | :--- | :---: | :---: | :--- |
| **SA7** | **RedFlix** | 60 | 60 | Direct 1080p/720p mirrors (100% parity) |
| **SA7** | **MultiMovies** | 55 | 55 | Multi-audio & regional mirrors (100% parity) |
| **Nuvio** | **Tyvrel.** | 32 | 32 | Direct HLS streams (100% parity) |
| **Nuvio** | **Esvyl.** | 31 | 31 | VidBolt Callisto multi-lingual streams (100% parity) |
| **SA7** | **ToonStream** | 28 | 28 | Anime & animation direct links (100% parity) |
| **Vega** | **MovieBox Web** | 23 | 23 | Direct MP4/HLS streams (100% parity) |
| **SA7** | **DesiFlix** | 13 | 13 | 1080p BluRay HEVC 10-bit / WEB-DL (100% parity) |
| **Nuvio** | **Quinox.** | 8 | 13 | Direct HLS streams (+5 Beamup) |
| **SA7** | **VidRock** | 9 | 9 | 1080p FHD Hindi Dubbed streams (100% parity) |
| **SA7** | **NetMirror** | 8 | 8 | Adaptive HLS Netflix/Hotstar streams (100% parity) |
| **Vega** | **Castle TV** | 8 | 8 | Direct HLS series streams (100% parity) |
| **SA7** | **Movix VF** | 6 | 6 | French VF stream mirrors (100% parity) |
| **Nuvio** | **Haylox.** | 6 | 6 | Vidlink 1080p stream mirrors (100% parity) |
| **Vega** | **1Flex** | 5 | 6 | Cinejoy Light direct streams |
| **Nuvio** | **Fendrix.** | 5 | 5 | Direct HLS stream mirrors (100% parity) |
| **Vega** | **MoviezWap** | 3 | 3 | Regional direct mirrors (100% parity) |
| **Vega** | **AnimeSalt** | 1 | 1 | Anime direct stream (100% parity) |
| **SA7** | **TopCartoons** | 1 | 1 | Cartoon direct stream (100% parity) |

---

### 2.2 Tier 2: Providers that Work Well on RAILWAY ONLY (17 Providers)
These providers succeed on Railway, but are **disabled on Beamup** because they fail, get blocked, or time out on Beamup:

| Fleet | Provider Display Name | Internal Scraper ID | Railway Yield | Beamup Yield | Root Cause on Beamup |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **Vega** | **4khdHub** | `4khdhub` | **152** | **29** | Cloudflare Turnstile / IP rate limiting on Beamup |
| **Vega** | **MultiStream** | `autoEmbed` | **30** | **2** | AutoEmbed Cinejoy extraction fails on Beamup |
| **Vega** | **ShowBox** | `showbox` | **23** | **0** | Blocked / returns "no streams found" on Beamup |
| **Vega** | **HdHub4u** | `hdhub4u` | **20** | **0** | Immediate IP rejection (empty in 637ms) on Beamup |
| **Vega** | **VMovies** | `vega` | **9** | **0** | Blocked / returns empty on Beamup |
| **Nuvio** | **Fjoral.** | `fjoral` | **32** | **0** | Mirror connection blocked on Beamup |
| **Nuvio** | **Xylos.** | `xylos` | **18** | **0** | Egress IP rejected by scraper host |
| **Nuvio** | **Maelith.** | `maelith` | **18** | **8** | Exceeds 11s deadline on Beamup (`avgMs: 10,892ms`) |
| **Nuvio** | **Xandril.** | `xandril` | **14** | **0** | Mirror connection blocked on Beamup |
| **Nuvio** | **Vitrix.** | `vitrix` | **8** | **0** | Blocked on Beamup |
| **Nuvio** | **Ozeris.** | `ozeris` | **7** | **0** | Blocked on Beamup |
| **Nuvio** | **Ilvyrel.** | `ilvyrel` | **6** | **0** | Blocked on Beamup |
| **Nuvio** | **Solunix.** | `solunix` | **5** | **0** | Blocked on Beamup |
| **Nuvio** | **Qorva.** | `qorva` | **3** | **0** | Blocked on Beamup |
| **Nuvio** | **Lenyr.** | `lenyr` | **2** | **0** | Blocked on Beamup |
| **Nuvio** | **Phraxis.** | `phraxis` | **2** | **0** | Blocked on Beamup |
| **Nuvio** | **Praxiel.** | `praxiel` | **2** | **0** | Blocked on Beamup |

---

### 2.3 Tier 3: Providers that Work Well on BEAMUP (4 Providers)
These providers resolved **exclusively or with higher stream counts on Beamup**:

| Fleet | Provider Name | Internal Scraper ID | Railway Streams | Beamup Streams | Notes |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **Vega** | **AnimeWorld** | `animeworld` | **0** | **35** | Anime series scraper resolved cleanly on Beamup |
| **Vega** | **Movies4U** | `movies4u` | **0** | **10** | Direct stream extraction succeeded on Beamup |
| **Nuvio** | **Sylphera.** | `sylphera` | **0** | **8** | Dexter 2160p / 1080p HLS mirror active on Beamup |
| **Vega** | **RogMovies** | `rogmovies` | **0** | **7** | Regional movie scraper resolved on Beamup |

---

### 2.4 Tier 4: Providers Inactive on Both Platforms
- **SA7:** `dahmermovies`, `dahmermovies-tv`, `einthusan`, `kurage`, `playimdb`, `puretoons`.
- **Nuvio:** `jyniq`, `kethrax`, `kryxalia`, `lyrin`, `noctyx`, `novus`, `nyxora`, `onyxia`, `rylvane`, `svartok`, `vyranel`, `waelum`, `wrenok`.
- **Vega:** `anikoto`, `animesub`, `dramacool`, `drive`, `eonMovies`, `everything`, `gokuHD`, `kickAssAnime`, `kissKh`, `kmMovies`, `luxMovies`, `mod` *(MoviesMod)*, `movielinkdb`, `mxplayer`, `rareanimes`, `zeefliz`.

---

## 3. Configuration Enforcement

The 17 Railway-only providers are disabled on Beamup via Dokku environment variables:
- `NUVIO_DISABLED_SCRAPERS=fjoral,xylos,maelith,xandril,vitrix,ozeris,ilvyrel,solunix,qorva,lenyr,phraxis,praxiel`
- `VEGA_DISABLED_PROVIDERS=4khdhub,autoEmbed,showbox,hdhub4u,vega`

These are managed both directly on Dokku and synced automatically in GitHub Actions `.github/workflows/ci.yml`.
