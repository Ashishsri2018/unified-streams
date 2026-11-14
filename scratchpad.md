# Scratchpad — Unified Streams

## Active Task: Instance Comparison (Railway vs Docker Beamup)

### Test Target 1: Fight Club (`tt0137523`)
- **Railway**: 115 streams (97 direct, 18 externalUrl), duration ~17.1s
- **Beamup**: 71 streams (53 direct, 18 externalUrl), duration ~17.0s
- **Common Stream URLs**: 50 identical streams
- **Railway Exclusive**: 65 streams (4khdHub, MoviesMod, HdHub4u, Maelith, Quinox, Tyvrel, VMovies, Xylos)
- **Beamup Exclusive**: 21 streams (Sylphera, etc.)

### Test Target 2: The Shawshank Redemption (`tt0111161`)
- **Railway**: 85 streams (71 direct, 14 externalUrl), duration ~16.8s
- **Beamup**: 60 streams (46 direct, 14 externalUrl), duration ~12.5s
- **Common Stream URLs**: 41 identical streams
- **Railway Exclusive**: 44 streams (4khdHub, Maelith, Quinox, Tyvrel, VMovies)
- **Beamup Exclusive**: 19 streams (Sylphera, etc.)

### Key Findings
1. **SA7 Fleet**: 100% parity across all SA7 providers (DesiFlix, Movix, MultiMovies, NetMirror, RedFlix, VidRock).
2. **Vega & Nuvio Fleets**: Discrepancies driven by network egress IP blocks/Cloudflare turnstile/timeouts on Beamup for aggressive scrapers (4khdHub, MoviesMod, HdHub4u, Maelith, Quinox).
3. **Specification Compliance**:
   - Both strictly sort direct streams before external links.
   - Both tag external links with 🖥️ prefix.
   - Both tag compressed archives with 🔲 prefix.
   - Both provide `subtitles` and `behaviorHints` with required request headers.
   - Beamup manifest exposes `idPrefixes: ["tt", "tmdb:"]` whereas Railway exposes `["tt"]`.
