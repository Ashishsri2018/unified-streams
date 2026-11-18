# Cross-Fleet Provider Mapping Reference

Canonical reference for duplicate providers across **Nuvio**, **Vega**, and **SA7**. Derived from the upstream `pages`/`main` branches; upstream changes independently, so re-verify before acting on a mapping.

- Provider counts: SA7 28, Nuvio 51, Vega 66.
- 25 duplicate clusters: 10 three-fleet, 5 Nuvio↔SA7, 4 Vega↔SA7, 6 Nuvio↔Vega.
- Hard-disabled by policy: `torrentio`, `internetArchive`/`brellor`, YouTube, BDIX (`bdix-cf`, `bdix-df`, `bdix-fh`), live TV; see `config/providers.json`.

## 1. Duplicate clusters (canonical)

The former machine-readable CSV section was removed as an exact duplicate of this table.

| # | Service | Nuvio | Vega | SA7 | Upstream URL |
|---|---|---|---|---|---|
| 1 | Anikoto | `zyrvael` | `anikoto` | `anizen` | anikoto.cz / .net |
| 2 | 4kHdHub | `hexion` | `4khdhub` | `4khdhub` | 4khdhub.one |
| 3 | AnimeWorld | `gravix` | `animeworld` | `animeworld` | watchanimeworld.one |
| 4 | Castle TV | `karnis` | `castle` | `castle` | api.hlowb.com |
| 5 | HDHub4u | `qyrvaen` | `hdhub4u` | `hdhub4u` | new*.hdhub4u.cl |
| 6 | MovieBox | `mavonyx` | `movieBoxWeb`, `movieBox` | `moviebox` | themoviebox.xyz / officialmoviebox.com |
| 7 | MoviesDrive | `vornix` | `drive` | `moviesdrive` | new*.moviesdrive.cyou |
| 8 | MultiMovies | `fastrion` | `multi` | `multimovies` | embed.filmu.in / m1.multimovies.courses |
| 9 | NetMirror family | `soryn` | `netflixMirror`, `disneyMirror`, `primeMirror` | `netmirror` | net27/net52/net77.cc |
| 10 | VegaMovies | `solunix` | `vega` | `vegamovies` | vegamovies.lease / api.hicine.sbs |
| 11 | AniKage | `xylos` | — | `anikage` | anikage.cc |
| 12 | AnimeSalt | — | `animesalt` | `animesalt` | animesalt.in / .cx |
| 13 | AniZone | `lenyr` | — | `anizone` | anizone.to |
| 14 | Cinejoy | `fendrix` | `1flex`, `autoEmbed` | — | cinejoy.pk |
| 15 | Dahmermovies (111477) | — | `a111477` | `dahmermovies`, `dahmermovies-tv` | a/st.111477.xyz |
| 16 | Internet Archive | `brellor` | `internetArchive` | — | archive.org |
| 17 | KatMovieHD / KatWorld | `qorva` | `katmovies`, `katMovieFix` | — | new.katmoviehd.top |
| 18 | KissKH | `fyron` | `kissKh` | — | kisskh.ovh / .is |
| 19 | MovieLinkBD | `jhaeros` | `movielinkdb` | — | movielinkbd.at / .li |
| 20 | MoviesMod | — | `mod` | `moviesmod` | moviesmod.tw / .meme |
| 21 | PlayIMDb / VAplayer | `zevran` | — | `playimdb` | streamdata.vaplayer.ru |
| 22 | Re:ANIME | `praxiel` | — | `reanime` | reanime.to |
| 23 | ShowBox / FebBox | `pynvix` | `showbox` | — | febbox.com / showbox.media |
| 24 | Torrentio | — | `torrentio` | `torrentio` | torrentio.strem.fun |
| 25 | VidRock | `evyrith` | — | `vidrock` | vidrock.net |

## 2. SA7 catalog (28)

Source: `SA7ANI/cb-providers` (`main`).

| ID / file | Service | Upstream | Notes |
|---|---|---|---|
| `4khdhub` | 4KHDHub | 4khdhub.one | Pixeldrain, HubCloud |
| `anikage` | AniKage | anikage.cc | player og.bakayaro.live |
| `animesalt` | AnimeSalt | animesalt.cx | AbyssPlayer, Hydrax |
| `animeworld` | AnimeWorld | watchanimeworld.one | AbyssPlayer, Hydrax, Short.icu |
| `anizen` | AniZen | anikoto.net | Anikoto TV API |
| `anizone` | AniZone | anizone.to | seiryuu.vid-cdn.xyz |
| `castle` | Castle | api.hlowb.com | app backend |
| `dahmermovies-tv` (`dahmermovies-4k.js`) | Dahmermovies-TV | st.111477.xyz | TV mirror |
| `dahmermovies` | Dahmermovies | st.111477.xyz | movie mirror |
| `desiflix` | DesiFlix | manifest.desitvhub.eu.org | — |
| `einthusan` | Einthusan | einthusan.tv | einthusan.asaddon.com, cdn2.einthusan.io |
| `hdhub4u` | HDHub4u | new7.hdhub4u.cl | search.pingora.fyi |
| `kurage` | Kurage | kurage.live | AniList GraphQL, ARM resolver |
| `moviebox` | MovieBox | moviebox.ph | api3.aoneroom.com |
| `moviesdrive` | MoviesDrive | new1.moviesdrive.cyou | HubCloud, GDrive |
| `moviesmod` | MoviesMod | moviesmod.meme | FastDL, NaukriAdda |
| `movix-vf` (`movix.js`) | Movix VF | movix. | French VF/VOSTFR |
| `multimovies` | MultiMovies | m1.multimovies.courses | embed.filmu.in |
| `netmirror` | NetMirror | net52.cc | mobile bypass nodes |
| `playimdb` | PlayIMDb | streamdata.vaplayer.ru | Referer nextgencloudfabric.com |
| `puretoons` | PureToons | puretoons.in | player toonstream.us |
| `reanime` | Re:ANIME | reanime.to | flixcloud.cc |
| `redflix` | RedFlix | redflix.biz | direct mirrors |
| `toonstream` | ToonStream | toonstream.us | RubyStream CDN |
| `topcartoons` | TopCartoons | topcartoons.tv | direct embedder |
| `torrentio` | Torrentio | torrentio.strem.fun | hard-disabled |
| `vegamovies` | VegaMovies | new1.vegamovies.lease | Fast-DL, Pixeldrain |
| `vidrock` | VidRock | vidrock.net | direct resolver |

## 3. Nuvio catalog (51)

Source: `eclipsia/nuvio-plugin` (`pages`).

| ID / file | Service | Upstream | Notes |
|---|---|---|---|
| `bdix-cf` | Circle FTP | new.circleftp.net | hard-disabled (BDIX) |
| `bdix-df` | DhakaFlix FTP | 172.16.50.12/.14 | hard-disabled (BDIX) |
| `bdix-fh` | FlixHub FTP | flixhub.net | hard-disabled (BDIX) |
| `brellor` | Internet Archive | archive.org | hard-disabled |
| `durnel` | CTGMovies | ctgmovies.com | nip.io API |
| `esvyl` | VidBolt | vidbolt.xyz | /api/resolve |
| `evyrith` | Vidrock | vidrock.net | direct |
| `fastrion` | MultiMovies | embed.filmu.in | workers.dev API |
| `fendrix` | Cinejoy | cinejoy.pk | wing.st, shegu.xyz |
| `fjoral` | GramCinema | bollywood.eu.org | requires `GRAMCINEMA_TOKEN` |
| `fyron` | KissKH | kisskh.ovh | enc-dec.app decryptor |
| `gravix` | AnimeWorld | watchanimeworld.one | AbyssPlayer, Hydrax |
| `haylox` | Vidlink | vidlink.pro | /api/b |
| `hexion` | 4kHdHub | 4khdhub.one | Pixeldrain, HubCloud |
| `ilvyrel` | ToonWorld4All | toonworld4all.me | archive mirror |
| `jhaeros` | MovieLinkBD | movielinkbd.at | BDIX FTP |
| `jyniq` | Wikimedia Commons | commons.wikimedia.org | Wikipedia API |
| `karnis` | Castle | api.hlowb.com | app backend |
| `kethrax` | VixSrc | vixsrc.to | Italian/English |
| `kryxalia` | MoviesHunt | new4.movieshunt.website | abhilinks.site |
| `lenyr` | AniZone | anizone.to | animap.id |
| `lyrin` | BanglaPlex | banglaplex.biz | Bengali catalog |
| `maelith` | Mapple | mapple.fun | slow; multi-mirror |
| `mavonyx` | MovieBox | themoviebox.xyz | aoneroom.com APIs |
| `noctyx` | Toonix | toonix.bond | anime/cartoons |
| `novus` | Dulo | dulo.mov | mainstream |
| `nyxora` | VidFast | vidfast.vc | enc-dec.app decryptor |
| `onyxia` | Ani.Pm | ani.pm | embed.settlar.io |
| `ozeris` | Anv | anv.to | anime host |
| `phraxis` | Play4u | play4u.org | embedded player |
| `praxiel` | Re:ANIME | reanime.to | flixcloud.cc |
| `pynvix` | ShowBox/FebBox | febbox.com | requires FebBox token |
| `qorva` | KatWorld | new.katmoviehd.top | kmhd.me shortlinks |
| `quinox` | VidNest | vidnest.fun | worker CDN nodes |
| `qyrvaen` | HDHub4u | new8.hdhub4u.cl | search.pingora.fyi |
| `rylvane` | WcoFlix | wcoflix.tv | embed.wcostream.com |
| `rynara` | Vidy | vidy.st | api.wecollege.net |
| `solunix` | VegaMovies/HiCine | api.hicine.sbs | — |
| `soryn` | NetMirror | net27.cc | videodownloader.site |
| `svartok` | CinemaCity | cinemacity.cc | cc.realbestia.com proxy |
| `sylphera` | Dexter | dexter.pw | Beamup-exclusive |
| `tyvrel` | Nxsha | nxsha.space | direct |
| `vitrix` | AniLight | anilight.live | api.anilight.live |
| `vornix` | MoviesDrive | new1.moviesdrive.cyou | pixeldrain.dev |
| `vyranel` | AnimeCube | animecube.live | Dailymotion, Rumble |
| `waelum` | BingeBang | bingebang.st | mainstream |
| `wrenok` | Purstream | purstream.ad | api.purstream.ad |
| `xandril` | AniChan | anichan.to | multi-player |
| `xylos` | AniKage | anikage.cc | og.bakayaro.live |
| `zevran` | VAplayer | streamdata.vaplayer.ru | nextgencloudfabric.com |
| `zyrvael` | Anikoto | anikoto.cz | Czech/anime |

## 4. Vega catalog (66)

Source: `Zenda-Cross/vega-providers` (`main`). Status is upstream's own flag; runtime policy may disable further.

| ID | Service | Status | Upstream | Notes |
|---|---|---|---|---|
| `1cinevood` | Cinewood | Active | one.cinevood.business | dead upstream (reported) |
| `1flex` | 1Flex | Active | 1flex.org | db.1flex.org, vidzee.wtf |
| `4khdhub` | 4khdHub | Active | 4khdhub.one | direct extractor |
| `Joya9tv` | Joya9tv | Disabled | joya9tv1.com | live sports |
| `a111477` | A.111477 | Disabled | a.111477.xyz | 1proxy workers.dev |
| `anikoto` | Anikoto | Active | anikototv.bz | vibeplayer.site |
| `animesalt` | AnimeSalt | Active | animesalt.in | — |
| `animesub` | AnimeSub+ | Active | animesub.duckdns.org | torrent/magnet |
| `animetsu` | Animetsu | Disabled | animetsu.net | v2 API |
| `animeworld` | AnimeWorld | Active | watchanimeworld.one | AbyssPlayer/Hydrax |
| `autoEmbed` | MultiStream | Active | movy.sx | Cinejoy aggregator |
| `castle` | Castle TV | Active | api.hlowb.com | — |
| `cinefreak` | CineFreak | Disabled | cinefreak.net | CineCloud mirrors |
| `cinemaLuxe` | CinemaLuxe | Disabled | cinemalux.cyou | cm-decrypt worker |
| `disneyMirror` | DisneyMirror | Active | net52.cc | NetMirror network |
| `dooflix` | Dooflix | Disabled | molop.art | app backend |
| `dramacool` | DramaCool | Active | asianc.id | AsianC/VidBasic |
| `drive` | MoviesDrive | Active | new3.moviesdrive.cyou | HubCloud/Pixeldrain |
| `durbinLive` | DurbinLive | Active | durbinlive.live | hard-disabled (live TV) |
| `eonMovies` | EonMovies | Active | new4.eonmovies.click | Pixeldrain/Dotflix |
| `everything` | Everything | Active | downloadeverythingfromeverywhere.com | Turnstile protected |
| `filmyfly` | FilmyFly | Disabled | filmyfiy.co.in | regional |
| `flixhq` | FlixHQ | Disabled | flixhq.to | Consumet |
| `gokuHD` | GokuHD | Active | gokuhd.nl | search.pingora.fyi |
| `guardahd` | GuardaHD | Disabled | guardahd.stream | Italian |
| `hdhub4u` | HdHub4u | Active | new14.hdhub4u.cl | HubCloud resolver |
| `hiAnime` | HiAnime | Disabled | hianime.to | MegaCloud |
| `internetArchive` | Internet Archive | Active | archive.org | hard-disabled |
| `kartoons` | Kartoons | Active | kartoons.to | device-session auth |
| `katMovieFix` | KatMovieFix | Disabled | katmoviefix.study | KatMovieHD mirror |
| `katmovies` | KatMoviesHd | Active | new.katmoviehd.top | links.kmhd.me |
| `kickAssAnime` | KickAssAnime | Active | kaa.lt | 1proxy workers.dev |
| `kissKh` | KissKh | Active | kisskh.is | K-Drama/anime |
| `kmMovies` | KmMovies | Active | kmmovies.beer | Gofile |
| `liveTgTv` | LiveTG TV | Active | livetgtv.lovable.app | hard-disabled (live TV) |
| `luxMovies` | RogMovies | Active | rogmovies.autos | Beamup-exclusive |
| `mkvDrama` | MKVDrama | Disabled | mkvdrama.net | Gofile/Pixeldrain |
| `mod` | MoviesMod | Active | moviesmod.tw | FastDL/GDrive |
| `movieBox` | MovieBox App | Disabled | themoviebox.xyz | zendax.me proxy |
| `movieBoxWeb` | MovieBox Web | Active | officialmoviebox.com | — |
| `movielinkdb` | MovieLinkBD | Active | ex5wfv.movielinkbd.li | BDIX portal |
| `movies4u` | Movies4U | Active | movies4u.tc | Beamup-exclusive |
| `moviesApi` | MoviesApi | Disabled | vidspark.to | ext.8man.me |
| `moviezwap` | MoviezWap | Active | moviezwap.ing | regional |
| `multi` | MultiMovies | Disabled | m1.multimovies.courses | embed.filmu.in |
| `mxplayer` | MX Player | Active | mxplayer.in | Beamup only |
| `netflixMirror` | NetflixMirror | Active | net52.cc | NetMirror network |
| `ogomovies` | Ogomovies | Disabled | ogomovies.mobi | direct mirrors |
| `primeMirror` | PrimeMirror | Active | net52.cc | NetMirror network |
| `primewire` | Primewire | Disabled | primewire.pw | — |
| `protonMovies` | ProtonMovies | Disabled | m.protonmovies.space | — |
| `rareanimes` | Rareanimes | Active | rareanimes.foo | — |
| `ridoMovies` | RidoMovies | Disabled | ridomovies.tv | — |
| `ringz` | Ringz | Disabled | privatereporz.pages.dev | private repo |
| `showbox` | ShowBox | Active | showbox.media | FebBox resolver |
| `skyMovieHD` | SkyMovieHD | Disabled | skymovieshd.clinic | vgmlinks.click |
| `tokyoInsider` | TokyoInsider | Disabled | tokyoinsider.com | anime MP4 |
| `topmovies` | TopMovies | Active | moviesleech.club | dead upstream (reported) |
| `torrentio` | Torrentio | Active | torrentio.strem.fun | hard-disabled |
| `uhd` | UHDMovies | Active | uhdmovies.beauty | dead upstream (reported) |
| `uniquestream` | AnimeStream | Disabled | anime.uniquestream.net | DASH |
| `vadapav` | VadaPav | Disabled | vadapav.mov | directory server |
| `vega` | VMovies | Active | vegamovies.lease | V-Cloud |
| `world4u` | World4uFree | Active | world4ufree.vu | MediaFire |
| `youtube` | YouTube | Active | youtube.com | hard-disabled |
| `zeefliz` | Zeefliz | Active | zeefliz1.xyz | regional |
