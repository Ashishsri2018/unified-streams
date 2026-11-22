# Scratchpad — Railway vs Beamup Provider Allocation Mapping

## Overview
- Railway is the primary instance running 1 active copy of each multi-copy provider, plus primary single-copy providers.
- Beamup is the backup instance running backup copies:
  - For providers with 3 copies: 1 copy runs on Railway, remaining 2 copies run on Beamup as backup.
  - For providers with 2 copies: 1 copy runs on Railway, remaining 1 copy runs on Beamup as backup.
  - Slower / zero-yield single-copy providers deactivated on Railway to preserve timeouts/load are active on Beamup.
  - Policy hard-disabled classes remain disabled everywhere (`torrentio`, `internetarchive`, `youtube`, `brellor`, `durbinlive`, `livetgtv`, `bdix-cf`, `bdix-df`, `bdix-fh`, `jyniq`, `mxplayer`).

## 3-Copy Provider Matrix (Tri-Fleet)

| Provider Name | Duplicate Group | Railway Active Copy (1) | Beamup Backup Copies (2) | Railway Deactivated IDs |
| :--- | :--- | :--- | :--- | :--- |
| **4KHDHub** | `4khdhub` | Nuvio `hexion` | Vega `4khdhub` + SA7 `4khdhub` | `sa7:4khdhub`, `vega:4khdhub` |
| **Anikoto** | `anikoto` | SA7 `anizen` | Nuvio `zyrvael` + Vega `anikoto` | `nuvio:zyrvael`, `vega:anikoto` |
| **Castle** | `castle` | SA7 `castle` | Nuvio `karnis` + Vega `castle` | `nuvio:karnis`, `vega:castle` |
| **HDHub4u** | `hdhub4u` | SA7 `hdhub4u` | Nuvio `qyrvaen` + Vega `hdhub4u` | `nuvio:qyrvaen`, `vega:hdhub4u` |
| **MoviesDrive** | `moviesdrive` | Nuvio `vornix` | Vega `drive` + SA7 `moviesdrive` | `sa7:moviesdrive`, `vega:drive` |
| **MultiMovies** | `multimovies` | SA7 `multimovies` | Nuvio `fastrion` + Vega `multi` | `nuvio:fastrion`, `vega:multi` |
| **NetMirror** | `netmirror` | SA7 `netmirror` | Vega `netflixMirror` + Nuvio `soryn` | `nuvio:soryn`, `vega:netflixMirror` |
| **MovieBox** | `moviebox` | Vega `movieBoxWeb`/`movieBox` | Nuvio `mavonyx` + SA7 `moviebox` | `sa7:moviebox`, `nuvio:mavonyx` |
| **AnimeWorld** | `animeworld` | Vega `animeworld` | Nuvio `gravix` + SA7 `animeworld` | `sa7:animeworld`, `nuvio:gravix` |

## 2-Copy Provider Matrix (Dual-Fleet)

| Provider Name | Duplicate Group | Railway Active Copy (1) | Beamup Backup Copy (1) | Railway Deactivated ID |
| :--- | :--- | :--- | :--- | :--- |
| **AniKage** | `anikage` | Nuvio `xylos` | SA7 `anikage` | `sa7:anikage` |
| **AnimeSalt** | `animesalt` | SA7 `animesalt` | Vega `animesalt` | `vega:animesalt` |
| **AniZone** | `anizone` | Nuvio `lenyr` | SA7 `anizone` | `sa7:anizone` |
| **KatMoviesHd**| `katmovies` | Nuvio `qorva` | Vega `katmovies` | `vega:katmovies` |
| **KissKh** | `kisskh` | Vega `kissKh` | Nuvio `fyron` | `nuvio:fyron` |
| **MovieLinkBD**| `movielinkdb`| Nuvio `jhaeros` | Vega `movielinkdb` | `vega:movielinkdb` |
| **MoviesMod** | `moviesmod` | Vega `mod` | SA7 `moviesmod` | `sa7:moviesmod` |
| **Reanime** | `reanime` | Nuvio `praxiel` | SA7 `reanime` | `sa7:reanime` |
| **ShowBox** | `showbox` | Vega `showbox` | Nuvio `pynvix` | `nuvio:pynvix` |
| **PlayIMDb** | `playimdb` | SA7 `playimdb` | Nuvio `zevran` | `nuvio:zevran` |
| **VegaMovies** | `vegamovies` | Vega `vega` | SA7 `vegamovies` | `sa7:vegamovies` |
| **VidRock** | `vidrock` | Nuvio `evyrith` | SA7 `vidrock` | `sa7:vidrock` |

## Single-Copy Providers Deactivated on Railway -> Active on Beamup

| Provider Name | Fleet & ID | Status / Role on Beamup |
| :--- | :--- | :--- |
| **Kurage** | `sa7:kurage` | Active on Beamup |
| **PureToons** | `sa7:puretoons` | Active on Beamup |
| **ToonStream** | `sa7:toonstream` | Active on Beamup |
| **BanglaPlex** | `nuvio:lyrin` | Active on Beamup |
| **Dulo** | `nuvio:novus` | Active on Beamup |
| **AnimeCube** | `nuvio:vyranel` | Active on Beamup |
| **vixsrc** | `nuvio:kethrax` | Active on Beamup |
| **DramaCool** | `vega:dramacool` | Active on Beamup |
| **EonMovies** | `vega:eonMovies` | Active on Beamup |
| **GokuHD** | `vega:gokuHD` | Active on Beamup |
| **KickAssAnime** | `vega:kickAssAnime` | Active on Beamup |
| **Rareanimes** | `vega:rareanimes` | Active on Beamup |
