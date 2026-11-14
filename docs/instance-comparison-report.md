# Instance Comparison Report: Railway vs Docker Beamup

**Date:** 2026-11-13  
**Target Instances:**
1. **Railway Production:** `https://unified-streams-production.up.railway.app/`
2. **Docker Beamup:** `https://a38b6dd4fcd1-unified-streams-docker.baby-beamup.club/`

---

## 1. Executive Summary

Both instances were evaluated by querying identical movie content IDs:
- **Test Target 1:** *Fight Club* (`tt0137523`)
- **Test Target 2:** *The Shawshank Redemption* (`tt0111161`)

Both deployments are operational, running application version `1.0.0` with identical baseline/snapshot commits across all internal fleets (**SA7**: bundled, **Nuvio**: `de572df35a304fb135eefff5cd164e61007e57224e544820681d783315d40ec9`, **Vega**: `fc747cdca16aa4334cce42017e8b1c40789d6df1`).

However, **Railway consistently returns ~50–60% more streams than Beamup**:
- **Fight Club (`tt0137523`):** 115 streams (Railway) vs 71 streams (Beamup) — 50 streams share identical URLs.
- **The Shawshank Redemption (`tt0111161`):** 85 streams (Railway) vs 60 streams (Beamup) — 41 streams share identical URLs.

---

## 2. Quantitative Comparison

### 2.1 Fight Club (`tt0137523`)

| Metric / Attribute | Railway (`unified-streams-production`) | Beamup (`unified-streams-docker`) | Difference |
| :--- | :--- | :--- | :--- |
| **HTTP Status** | `200 OK` | `200 OK` | Identical |
| **Response Latency (Cold Miss)** | `17,176 ms` | `17,026 ms` | ~150 ms delta |
| **Total Stream Count** | **115** | **71** | **+44 on Railway** |
| **Direct Streams (`url`)** | 97 (84.3%) | 53 (74.6%) | +44 on Railway |
| **External Links (`externalUrl`)** | 18 (15.7%) | 18 (25.4%) | Identical |
| **Torrent / InfoHash Streams** | 0 | 0 | Identical |
| **2160p / 4K Streams** | 12 (1 2160p, 11 4K) | 2 (1 2160p, 1 4K) | +10 on Railway |
| **1080p Streams** | 55 | 39 | +16 on Railway |
| **720p Streams** | 7 | 3 | +4 on Railway |
| **480p Streams** | 4 | 1 | +3 on Railway |
| **Unknown Resolution** | 37 | 26 | +11 on Railway |
| **URL Overlap** | 50 identical URLs | 50 identical URLs | 65 Railway unique / 21 Beamup unique |
| **Manifest `idPrefixes`** | `["tt"]` | `["tt", "tmdb:"]` | Beamup exposes TMDB support |
| **Edge Server / Routing** | Railway Hikari (`sin1.nzn2`) | Cloudflare CDN (`sin1`) | Distinct edge proxy layers |
| **Cache-Control Header** | `no-store` | `no-store` | Fully compliant |

### 2.2 The Shawshank Redemption (`tt0111161`)

| Metric / Attribute | Railway (`unified-streams-production`) | Beamup (`unified-streams-docker`) | Difference |
| :--- | :--- | :--- | :--- |
| **HTTP Status** | `200 OK` | `200 OK` | Identical |
| **Response Latency (Cold Miss)** | `16,897 ms` | `12,480 ms` | -4,417 ms on Beamup |
| **Total Stream Count** | **85** | **60** | **+25 on Railway** |
| **Direct Streams (`url`)** | 71 (83.5%) | 46 (76.7%) | +25 on Railway |
| **External Links (`externalUrl`)** | 14 (16.5%) | 14 (23.3%) | Identical |
| **2160p / 4K Streams** | 15 (2 2160p, 13 4K) | 2 (1 2160p, 1 4K) | +13 on Railway |
| **1080p Streams** | 38 | 34 | +4 on Railway |
| **720p Streams** | 6 | 3 | +3 on Railway |
| **480p Streams** | 3 | 2 | +1 on Railway |
| **URL Overlap** | 41 identical URLs | 41 identical URLs | 44 Railway unique / 19 Beamup unique |

---

## 3. Provider-by-Provider Breakdown

### 3.1 Fight Club (`tt0137523`) Provider Stream Counts

| Fleet | Provider Name | Railway | Beamup | Delta | Description & Host Details |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **SA7** | **DesiFlix** | 3 | 3 | 0 | 1080p BluRay HEVC 10-bit & WEB-DL Hindi |
| **SA7** | **Movix VF** | 1 | 1 | 0 | 1080p French VF stream |
| **SA7** | **MultiMovies** | 12 | 12 | 0 | 1080p WEB-DL Multi-Audio mirrors |
| **SA7** | **NetMirror** | 2 | 2 | 0 | 1080p Netflix & Hotstar HLS adaptive streams |
| **SA7** | **RedFlix** | 12 | 12 | 0 | 1080p & 720p direct mirrors |
| **SA7** | **VidRock** | 4 | 4 | 0 | 1080p FHD Hindi Dubbed streams |
| **Vega** | **MovieBox Web** | 22 | 22 | 0 | Multi-quality direct MP4/HLS streams |
| **Vega** | **Castle TV** | 2 | 2 | 0 | Direct HLS streams |
| **Vega** | **MoviezWap** | 3 | 3 | 0 | Direct regional stream mirrors |
| **Nuvio** | **Esvyl.** | 4 | 4 | 0 | VidBolt Callisto Russian / Portuguese mirrors |
| **Nuvio** | **Fendrix.** | 1 | 1 | 0 | Direct stream |
| **Nuvio** | **Haylox.** | 1 | 1 | 0 | Vidlink 1080p stream |
| **Vega** | **4khdHub** | 10 | 0 | +10 | Cloudflare R2 Storage & Google Drive downloads |
| **Vega** | **HdHub4u** | 9 | 0 | +9 | CF Storage & CF Worker fast streams |
| **Vega** | **MoviesMod** | 7 | 0 | +7 | Resume Cloud (Fast), Worker 1.3 / 1.4 |
| **Vega** | **🔲 MoviesMod** | 2 | 0 | +2 | Direct archive ZIP downloads |
| **Vega** | **1Flex** | 2 | 0 | +2 | Cinejoy Light (4K) |
| **Vega** | **VMovies** | 2 | 0 | +2 | Direct stream mirrors |
| **Nuvio** | **Maelith.** | 3 | 0 | +3 | Mapple Poseidon 2160p / 1080p |
| **Nuvio** | **Quinox.** | 3 | 0 | +3 | Direct HLS streams |
| **Nuvio** | **Tyvrel.** | 4 | 0 | +4 | Direct HLS streams |
| **Nuvio** | **Xylos.** | 6 | 0 | +6 | Direct HLS streams |
| **Vega** | **MultiStream** | 0 | 2 | -2 | Cinejoy Light 4K (AutoEmbed extractor) |
| **Nuvio** | **Sylphera.** | 0 | 2 | -2 | Dexter 2160p & 1080p HLS |

### 3.2 Key Fleet Patterns

1. **SA7 Fleet (100% Parity):** Every SA7 provider returned identical stream counts and exact URL matches across both instances.
2. **Vega Fleet Discrepancies:** Aggressive scraper providers (`4khdHub`, `HdHub4u`, `MoviesMod`) succeeded on Railway but yielded 0 streams on Beamup.
3. **Nuvio Fleet Discrepancies:** Heavy resolvers (`Maelith.`, `Quinox.`, `Tyvrel.`, `Xylos.`) succeeded on Railway but timed out on Beamup. `Sylphera.` succeeded on Beamup while returning empty on Railway.

---

## 4. Root Cause Analysis

Telemetry from `/health` circuit counters and provider statistics identifies three root causes:

### 4.1 Egress IP Reputation & Anti-Bot Filtering
- Hosters scraped by `4khdHub`, `HdHub4u`, and `MoviesMod` enforce Cloudflare Turnstile, browser checks, or datacenter IP blacklists.
- Railway's container egresses from Railway's Singapore datacenter network (`sin1`) with clean egress.
- Beamup operates on `baby-beamup.club` infrastructure (frequently used for public Stremio addons), which faces elevated IP block rates. On Beamup, `hdhub4u` finished in **637 ms with empty results** (immediate blocking/rejection), whereas on Railway it took **10,123 ms** and extracted 9 streams.

### 4.2 Latency Budgets & Worker Deadlines
- The gateway enforces a strict per-worker timeout (`BACKEND_TIMEOUT_MS - 1000 = 11,000 ms`). Slow worker responses are cancelled and partial results are merged.
- On Beamup:
  - `Maelith.` recorded **12 timeouts out of 17 requests** (`avgMs: 10,892 ms`), consistently missing the deadline.
  - `Quinox.` recorded **8 timeouts out of 17 requests** (`avgMs: 8,311 ms`).
- On Railway:
  - `Maelith.` recorded **0 timeouts** (`avgMs: 8,219 ms`), successfully returning 2160p Mapple streams.
  - `Quinox.` recorded **0 timeouts**, returning 3 streams.

### 4.3 Gateway Caching Behavior
- Both instances utilize the gateway cache with request coalescing:
  - **Full result TTL:** 180 seconds.
  - **Partial result TTL:** 30 seconds.
- Because upstream timeouts occurred, both instances marked these initial responses as partial sets (`"partialSets": 1` in `/health`), applying the 30-second TTL rather than the 180-second TTL.

---

## 5. Specification & Addon Protocol Compliance

Both instances strictly satisfy all constraints in `AGENTS.md`:

1. **Sorting Order:** Direct playable streams (`url`) are strictly ordered before external browser links (`externalUrl`).
2. **Emoji Prefixes:**
   - External links are prefixed with the **🖥️** emoji in the `title` attribute.
   - Compressed archive files (`.zip`, `.rar`) remain in `url` and are tagged with the **🔲** emoji in `name` (e.g. `🔲 MoviesMod`).
3. **HTTP Semantics:**
   - `GET` returns full payloads with CORS headers (`access-control-allow-origin: *`).
   - `HEAD` endpoints bypass provider calls with zero fan-out.
   - Stream endpoints return `cache-control: no-store` with gateway-managed caching.
