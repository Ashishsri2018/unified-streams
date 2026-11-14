# Scratchpad — Unified Streams

## Active Task: Provider Status Page Empty Results Investigation (Railway Instance)
- **Target Instance**: `https://unified-streams-production.up.railway.app/status` (polled from `/health`)
- **Initial Observation**: 40 out of 91 reporting providers exhibited `calls > 0 && empty === calls` (100% empty responses).

### Key Findings & Causes:
1. **Low Sample Size & Genre/Catalog Mismatch**:
   - Initial instance traffic consisted of only 8 uncached requests, all for mainstream Western movies/TV shows (*Fight Club*, *Shawshank Redemption*, *Dahmer*).
   - Providers specializing in other genres legitimately return `[]` (0 streams):
     - **Anime**: `vega:anikoto`, `vega:kickAssAnime`, `vega:animesalt`, `vega:rareanimes`, `nuvio:vyranel`, `nuvio:zyrvael`, `sa7:puretoons`.
       * *Empirical Validation*: Querying anime *Spirited Away* (`tt0245429`) immediately made `vega:anikoto` and `vega:kickAssAnime` resolve streams, turning `empty < calls` and updating `lastSuccessAt`.
     - **Indian / South Asian**: `sa7:einthusan`, `vega:mxplayer`.
       * *Empirical Validation*: Querying Bollywood movie *3 Idiots* (`tt1187043`) immediately made `sa7:einthusan` resolve streams, recording `lastSuccessAt`.
     - **Asian Drama**: `vega:dramacool`, `vega:kissKh`, `nuvio:fyron`.
     - **Live TV / IPTV**: `vega:durbinLive` and `vega:liveTgTv` serve live channel feeds, not on-demand movies/series.
2. **Dead / Changed Upstream Endpoints (Silently Returning `[]`)**:
   - Scrapers wrap network requests in `try / catch` returning `[]` on failure; the circuit breaker registers `outcome = 'empty'` rather than `error`.
   - `sa7:playimdb` & `nuvio:zevran`: Upstream `https://streamdata.vaplayer.ru/api.php` returns HTTP 404.
   - `sa7:redflix`: `https://redflix.biz` connection times out.
   - `vega:topmovies`: `moviesleech.club` DNS NXDOMAIN.
   - `vega:uhd`: `uhdmovies.beauty` SSL handshake error.
   - `vega:world4u`: `world4ufree.vu` connection times out.
   - `nuvio:durnel`: `cockpit.103.109.92.178.nip.io` & `ctgmovies.com` connection timed out.
   - `nuvio:fastrion`: Cloudflare worker backend `api.eclq-404.workers.dev` failing.
3. **Missing User Configuration / Tokens**:
   - `nuvio:pynvix`: Requires FebBox `uiToken` in user settings; without it, exits in 8ms with `[]`.
4. **Redundant / Blocked Duplicate Scrapers**:
   - Several Nuvio scrapers (`karnis`, `mavonyx`, `qyrvaen`) are unmaintained duplicates of Vega providers (`castle`, `movieBoxWeb`, `hdhub4u`) that fail Cloudflare turnstile/anti-bot checks.

---

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
