# Instance Comparison & Provider Compatibility Report: Railway vs Docker Beamup

**Date:** 2026-11-14  
**Target Instances:**
1. **Railway Production:** `https://unified-streams-production.up.railway.app/`
2. **Docker Beamup:** `https://a38b6dd4fcd1-unified-streams-docker.baby-beamup.club/`

---

## 1. Executive Summary

A targeted multi-media test suite was executed across both instances consisting of **2 movies, 2 TV series, and 2 anime**:
- **Movies:** *Fight Club* (`tt0137523`), *Interstellar* (`tt0816692`)
- **TV Series:** *Breaking Bad* S01E01 (`tt0903747:1:1`), *Stranger Things* S01E01 (`tt4574334:1:1`)
- **Anime:** *Attack on Titan* S01E01 (`tt2560140:1:1`), *Death Note* S01E01 (`tt0877057:1:1`)

Across the 6 targets:
- **Railway Production** returned **653 total streams** (average 108.8 streams per title).
- **Docker Beamup** returned **407 total streams** (average 67.8 streams per title).
- **Total Providers Yielding Streams:** 39 distinct active providers across both environments.

---

## 2. Target-by-Target Summary

| # | Category | Media Title | IMDb Content ID | Railway Yield | Beamup Yield | Latency Delta |
| :-: | :--- | :--- | :--- | :-: | :-: | :--- |
| **1** | Movie | *Fight Club (1999)* | `tt0137523` | **110 streams** (13.4s) | **105 streams** (16.7s) | Railway +5 streams, 3.3s faster |
| **2** | Movie | *Interstellar (2014)* | `tt0816692` | **99 streams** (18.0s) | **65 streams** (11.6s) | Railway +34 streams |
| **3** | Series | *Breaking Bad* S01E01 | `tt0903747:1:1` | **143 streams** (20.0s) | **54 streams** (12.0s) | Railway +89 streams |
| **4** | Series | *Stranger Things* S01E01 | `tt4574334:1:1` | **89 streams** (26.4s) | **66 streams** (12.7s) | Railway +23 streams |
| **5** | Anime | *Attack on Titan* S01E01 | `tt2560140:1:1` | **74 streams** (26.4s) | **76 streams** (17.3s) | Beamup +2 streams, 9.1s faster |
| **6** | Anime | *Death Note* S01E01 | `tt0877057:1:1` | **138 streams** (26.5s) | **41 streams** (12.7s) | Railway +97 streams |
| **Total** | | **All 6 Targets** | | **653 streams** | **407 streams** | **Railway +246 streams (+60.4%)** |

---

## 3. Provider Classification

### Tier 1: Providers that Work Well on BOTH Railway and Beamup (18 Providers)
These providers exhibit **100% or near-identical parity** across both platforms, with zero network blocking or Cloudflare issues.

| Fleet | Provider Name | Railway Streams | Beamup Streams | Stream Type & Features |
| :--- | :--- | :---: | :---: | :--- |
| **SA7** | **RedFlix** | 60 | 60 | Direct 1080p/720p mirrors (100% parity) |
| **SA7** | **MultiMovies** | 55 | 55 | Multi-audio & regional mirrors (100% parity) |
| **Nuvio** | **Tyvrel.** | 32 | 32 | Direct HLS streams (100% parity) |
| **Nuvio** | **Esvyl.** | 31 | 31 | VidBolt Callisto multi-lingual streams (100% parity) |
| **SA7** | **ToonStream** | 28 | 28 | Animation/Anime direct links (100% parity) |
| **Vega** | **MovieBox Web** | 23 | 23 | Direct MP4/HLS streams (100% parity) |
| **SA7** | **DesiFlix** | 13 | 13 | 1080p BluRay HEVC 10-bit / WEB-DL (100% parity) |
| **Nuvio** | **Quinox.** | 8 | 13 | Direct HLS streams (+5 on Beamup) |
| **SA7** | **VidRock** | 9 | 9 | 1080p FHD Hindi Dubbed streams (100% parity) |
| **SA7** | **NetMirror** | 8 | 8 | Adaptive HLS Netflix/Hotstar streams (100% parity) |
| **Vega** | **Castle TV** | 8 | 8 | Direct HLS streams (100% parity) |
| **SA7** | **Movix VF** | 6 | 6 | French VF stream mirrors (100% parity) |
| **Nuvio** | **Haylox.** | 6 | 6 | Vidlink 1080p stream mirrors (100% parity) |
| **Vega** | **1Flex** | 5 | 6 | Cinejoy Light direct streams |
| **Nuvio** | **Fendrix.** | 5 | 5 | Direct HLS stream mirrors (100% parity) |
| **Vega** | **MoviezWap** | 3 | 3 | Regional direct mirrors (100% parity) |
| **Vega** | **AnimeSalt** | 1 | 1 | Anime direct stream (100% parity) |
| **SA7** | **TopCartoons** | 1 | 1 | Cartoon direct stream (100% parity) |

---

### Tier 2: Providers that Work on RAILWAY ONLY (17 Providers)
These providers thrive on Railway due to its clean Singapore datacenter egress (`sin1`), but are **blocked, challenged by Cloudflare/anti-bot protection, or timed out** on Beamup (`baby-beamup.club`).

| Fleet | Provider Name | Railway Streams | Beamup Streams | Delta | Primary Failure Mode on Beamup |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Vega** | **4khdHub** | **152** | **29** | **+123** | Cloudflare Turnstile / IP rate limiting on Beamup |
| **Vega** | **MultiStream** | **30** | **2** | **+28** | AutoEmbed Cinejoy extraction fails on Beamup |
| **Vega** | **ShowBox** | **23** | **0** | **+23** | Blocked / returns "no streams found" on Beamup |
| **Vega** | **HdHub4u** | **20** | **0** | **+20** | Immediate rejection (637ms empty) on Beamup |
| **Vega** | **VMovies** | **9** | **0** | **+9** | Scraper returns empty on Beamup |
| **Nuvio** | **Fjoral.** | **32** | **0** | **+32** | Mirror connection blocked on Beamup |
| **Nuvio** | **Xylos.** | **18** | **0** | **+18** | Egress IP rejected by scraper host |
| **Nuvio** | **Maelith.** | **18** | **8** | **+10** | Exceeds 11s deadline on Beamup (avgMs: 10,892ms) |
| **Nuvio** | **Xandril.** | **14** | **0** | **+14** | Blocked on Beamup |
| **Nuvio** | **Vitrix.** | **8** | **0** | **+8** | Blocked on Beamup |
| **Nuvio** | **Ozeris.** | **7** | **0** | **+7** | Blocked on Beamup |
| **Nuvio** | **Ilvyrel.** | **6** | **0** | **+6** | Blocked on Beamup |
| **Nuvio** | **Solunix.** | **5** | **0** | **+5** | Blocked on Beamup |
| **Nuvio** | **Qorva.** | **3** | **0** | **+3** | Blocked on Beamup |
| **Nuvio** | **Lenyr.** | **2** | **0** | **+2** | Blocked on Beamup |
| **Nuvio** | **Phraxis.** | **2** | **0** | **+2** | Blocked on Beamup |
| **Nuvio** | **Praxiel.** | **2** | **0** | **+2** | Blocked on Beamup |

---

### Tier 3: Providers that Work on BEAMUP (4 Providers)
These providers produced **more streams or resolved exclusively on Beamup**, benefiting from Beamup's specific upstream routing or scraper rotation.

| Fleet | Provider Name | Railway Streams | Beamup Streams | Delta | Notes |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Vega** | **AnimeWorld** | **0** | **35** | **+35** | Anime series scraper resolved cleanly on Beamup |
| **Vega** | **Movies4U** | **0** | **10** | **+10** | Direct stream extraction succeeded on Beamup |
| **Nuvio** | **Sylphera.** | **0** | **8** | **+8** | Dexter 2160p / 1080p HLS mirror active on Beamup |
| **Vega** | **RogMovies** | **0** | **7** | **+7** | Resolved on Beamup |

---

### Tier 4: Providers Tested with 0 Streams Across Both (Inactive / Broken)
These enabled providers were queried across the 6 titles but returned zero streams, timed out, or encountered upstream errors:

- **SA7:** `dahmermovies`, `dahmermovies-tv`, `einthusan`, `kurage`, `playimdb`, `puretoons`.
- **Nuvio:** `jyniq`, `kethrax`, `kryxalia`, `lyrin`, `noctyx`, `novus`, `nyxora`, `onyxia`, `rylvane`, `svartok`, `vyranel`, `waelum`, `wrenok`.
- **Vega:** `anikoto`, `animesub`, `dramacool`, `drive`, `eonMovies`, `everything`, `gokuHD`, `kickAssAnime`, `kissKh`, `kmMovies`, `luxMovies`, `mod` *(MoviesMod - returned 403 Forbidden for series search)*, `movielinkdb`, `mxplayer`, `rareanimes`, `zeefliz`.

---

## 4. Key Takeaways & Recommendations

1. **SA7 Fleet Stability:** SA7 is rock-solid across both platforms, delivering 100% identical results for all major streaming providers (`RedFlix`, `MultiMovies`, `ToonStream`, `DesiFlix`, `VidRock`, `NetMirror`, `Movix VF`).
2. **Datacenter Advantage for Vega & Nuvio:** Scrapers in Vega (`4khdHub`, `HdHub4u`, `ShowBox`) and Nuvio (`Fjoral.`, `Xylos.`, `Maelith.`) are heavily dependent on clean egress IPs. Deploying on cloud infrastructure (Railway / Hetzner / AWS) yields significantly higher stream availability than shared community platforms (Beamup).
3. **Anime Specialization:** Beamup performs well for anime titles (matching or beating Railway on *Attack on Titan*), primarily driven by `AnimeWorld` (+35 streams) and `ToonStream`.
