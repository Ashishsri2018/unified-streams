const BASE_URL = "https://ani.pm";
const API_BASE = "https://embed.settlar.io";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";
const HEADERS = {
    "User-Agent": USER_AGENT,
    Referer: `${API_BASE}/`
};

const fetchJson = async (url, referer) => {
    try {
        const response = await fetch(url, {
            headers: { "User-Agent": USER_AGENT, Accept: "application/json", Referer: referer || `${BASE_URL}/` },
        });
        return response.ok ? await response.json() : null;
    } catch {
        return null;
    }
};

const tokenize = (value) => String(value || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const normalize = (value) => tokenize(value).join("");

const usableId = (id, anilistId) => {
    if (id == null) return null;
    if (id >= 1000000) {
        const parsed = parseInt(anilistId, 10);
        return Number.isNaN(parsed) ? id : parsed;
    }
    return id;
};

const tmdbJson = async (path) => {
    const separator = path.includes("?") ? "&" : "?";
    return fetchJson(`${TMDB_API}${path}${separator}api_key=${TMDB_KEY}`, "https://www.themoviedb.org/");
};

const fetchTmdbDetails = async (tmdbId, mediaType, season) => {
    const isTv = mediaType === "tv";
    const data = await tmdbJson(`/${isTv ? "tv" : "movie"}/${tmdbId}?append_to_response=alternative_titles`);
    if (!data) return null;

    const alternatives = (data.alternative_titles && (data.alternative_titles.results || data.alternative_titles.titles)) || [];
    const alternativeTitles = alternatives.map((entry) => entry.title).filter(Boolean).slice(0, 6);
    const primary = (isTv ? [data.name, data.original_name] : [data.title, data.original_title]).filter(Boolean);
    const titles = [...new Set([...primary, ...alternativeTitles])];

    let date = isTv ? data.first_air_date : data.release_date;
    if (isTv && season > 1) {
        const seasonInfo = (data.seasons || []).find((entry) => entry.season_number === season);
        let seasonDate = seasonInfo && seasonInfo.air_date;
        if (!seasonDate) {
            const seasonData = await tmdbJson(`/tv/${tmdbId}/season/${season}`);
            seasonDate = seasonData && seasonData.air_date;
        }
        if (seasonDate) date = seasonDate;
    }

    return {
        name: primary[0] || titles[0] || "",
        primaryTitles: primary,
        titles,
        year: parseInt(String(date || "").slice(0, 4), 10) || null
    };
};

const searchAnime = async (query) => {
    if (!query || query.length < 2) return [];
    const data = await fetchJson(`${BASE_URL}/api/anime/search?q=${encodeURIComponent(query)}`, `${BASE_URL}/`);
    return ((data && data.items) || []).filter((item) => item && item.id != null);
};

const hasSeasonMarker = (title, season) => {
    if (season < 2) return false;
    const padded = ` ${tokenize(title).join(" ")} `;
    const ordinal = { 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", 6: "6th" }[season];
    const roman = { 2: "ii", 3: "iii", 4: "iv", 5: "v", 6: "vi" }[season];
    const forms = [
        `season ${season}`,
        ordinal ? `${ordinal} season` : null,
        roman || null,
        String(season)
    ].filter(Boolean);
    return forms.some((form) => padded.includes(` ${form} `));
};

const scoreCandidate = (candidate, details, isTv, season) => {
    const title = candidate.title || "";
    const normalizedCandidate = normalize(title);
    const candidateTokens = tokenize(title);

    let score = Math.max(
        0,
        ...details.titles.map((name) => {
            const normalizedName = normalize(name);
            if (!normalizedName) return 0;
            if (normalizedCandidate === normalizedName) return 100;
            if (normalizedCandidate.startsWith(normalizedName) || normalizedName.startsWith(normalizedCandidate)) return 60;
            const nameTokens = tokenize(name);
            const shared = nameTokens.filter((token) => candidateTokens.includes(token)).length;
            return Math.round((shared / Math.max(nameTokens.length, candidateTokens.length, 1)) * 50);
        })
    );

    if (details.year && candidate.year) {
        const difference = Math.abs(details.year - candidate.year);
        score += difference === 0 ? 30 : difference === 1 ? 10 : -30;
    }

    const isMovie = String(candidate.type || "").toLowerCase() === "movie";
    if (isTv && isMovie) score -= 50;
    if (!isTv && isMovie) score += 20;

    if (isTv) {
        const match = title.toLowerCase().match(/season\s*(\d+)|(\d+)(?:st|nd|rd|th)\s*season/);
        const candidateSeason = match ? parseInt(match[1] || match[2], 10) : null;
        if (season > 1) {
            if (hasSeasonMarker(title, season)) score += 40;
            else if (candidateSeason != null && candidateSeason !== season) score -= 40;
        } else if (candidateSeason > 1) {
            score -= 40;
        }
    }
    return score;
};

const findAnime = async (details, isTv, season) => {
    const queries = [];
    if (isTv && season > 1) {
        queries.push(`${details.name} season ${season}`);
        const ordinal = { 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", 6: "6th" }[season];
        if (ordinal) queries.push(`${details.name} ${ordinal} season`);
    }
    details.primaryTitles.forEach((title) => {
        queries.push(title);
        if (isTv && season > 1) queries.push(`${title} season ${season}`);
    });
    details.titles.slice(0, 3).forEach((title) => queries.push(title));
    const uniqueQueries = [...new Set(queries.filter(Boolean))];

    const candidates = (await Promise.all(uniqueQueries.map((query) => searchAnime(query)))).flat();

    const byId = new Map();
    for (const item of candidates) {
        const id = usableId(item.id, item.anilistId);
        if (id != null && !byId.has(id)) byId.set(id, { ...item, id });
    }

    let bestMatch = null;
    const MIN_SCORE = 50;
    let bestScore = MIN_SCORE - 1;
    for (const candidate of byId.values()) {
        const score = scoreCandidate(candidate, details, isTv, season);
        if (score > bestScore) [bestMatch, bestScore] = [candidate, score];
    }
    return bestMatch;
};

const fetchSeries = async (id) => {
    const series = await fetchJson(`${BASE_URL}/api/anime/series/${id}?routes=e3`, `${BASE_URL}/`);
    if (!series && id >= 1000000) {
        return fetchJson(`${BASE_URL}/api/anime/series/${id - 1000000}?routes=e3`, `${BASE_URL}/`);
    }
    return series;
};

const buildSubtitles = (rawSubtitles, seen) => {
    const subtitles = [];
    for (const { url, label } of rawSubtitles.filter(Boolean)) {
        const name = String(label || "Subtitle");
        const keys = [`url:${url}`, `label:${name.trim().toLowerCase()}`];
        if (!/^https?:/i.test(url) || keys.some((key) => seen.has(key))) continue;
        keys.forEach((key) => seen.add(key));
        subtitles.push({ url, language: name, name, headers: HEADERS });
    }
    return subtitles;
};

const resolveSettlarStream = async (selection, episodeNumber, language, label, seenSubtitles) => {
    const session = await fetchJson(
        `${BASE_URL}/api/anime/settlar/session?selection=${encodeURIComponent(selection)}` +
        `&provider=anipm&ep=${episodeNumber}&channel=${language}&telemetry=0`,
        `${BASE_URL}/`
    );
    const token = session && session.embedUrl && /t=([^&]+)/.exec(session.embedUrl);
    if (!token) return null;

    const embed = await fetchJson(`${API_BASE}/api/embed/session?t=${token[1]}`, `${API_BASE}/embed/v1`);
    if (!embed || typeof embed.source !== "string" || !/^https?:/i.test(embed.source)) return null;

    return {
        name: label,
        title: label,
        url: embed.source,
        type: "hls",
        quality: "1080p",
        headers: HEADERS,
        subtitles: seenSubtitles && Array.isArray(embed.subtitles) ? buildSubtitles(embed.subtitles, seenSubtitles) : [],
    };
};

const fetchLanguageStreams = async (seriesId, episodeNumber, language, packagesPromise, seenSubtitles) => {
    const query = `?ep=${episodeNumber}&lang=${language}&backup=1`;
    const bootstrap =
        (await fetchJson(`${BASE_URL}/api/anime/playback-bootstrap/settlar/${seriesId}${query}`, `${BASE_URL}/`)) ||
        (await fetchJson(`${BASE_URL}/api/anime/playback-bootstrap/anilist/${seriesId}${query}`, `${BASE_URL}/`));
    const selection = bootstrap && typeof bootstrap.settlarSelection === "string" ? bootstrap.settlarSelection.trim() : "";
    if (!selection) return [];

    const packages = await packagesPromise;
    const packageEntry = packages && packages.episodes && packages.episodes[episodeNumber];
    const hasHardsub = packageEntry && packageEntry[`${language}hard`] === true;
    const label = `Ani.Pm \u2022 ${language === "dub" ? "English" : "Japanese"}`;

    const variants = [[language, label, seenSubtitles]];
    if (hasHardsub) variants.push([`${language}hard`, `${label} \u2022 Hard Sub`, null]);

    const streams = await Promise.all(
        variants.map((variant) => resolveSettlarStream(selection, episodeNumber, ...variant).catch(() => null))
    );
    return streams.filter(Boolean);
};

const verifyMaster = async (masterUrl, referer) => {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const response = await fetch(masterUrl, {
                headers: { "User-Agent": USER_AGENT, Accept: "*/*", Referer: referer }
            });
            if (response.ok) {
                const text = await response.text();
                if (text.startsWith("#EXTM3U")) return masterUrl;
            }
        } catch { }
    }
    return null;
};

const fetchBetaStreams = async (anilistId, episodeNumber, wantSub, wantDub) => {
    const info = await fetchJson(`${BASE_URL}/api/anime/beta-server/${anilistId}`, `${BASE_URL}/`);
    if (!info || info.available !== true) return [];
    if (!Array.isArray(info.episodes) || !info.episodes.includes(episodeNumber)) return [];
    if (!((wantSub && info.sub === true) || (wantDub && info.dub === true))) return [];
    if (!info.path || !info.origin) return [];

    const watchPath = String(info.path).replace(/^\/watch\//, "");
    const split = watchPath.lastIndexOf("-");
    if (split <= 0) return [];

    const origin = String(info.origin).replace(/\/+$/, "");
    const slug = watchPath.substring(0, split);
    const betaId = watchPath.substring(split + 1);
    const masterUrl = `${origin}/hls/${betaId}-${slug}/E${String(episodeNumber).padStart(4, "0")}/master.m3u8`;

    const master = await verifyMaster(masterUrl, `${origin}/`);
    if (!master) return [];
    return [{
        name: "Ani.Pm \u2022 Multi-Dub",
        title: "Ani.Pm \u2022 Multi-Dub",
        url: master,
        type: "hls",
        quality: "Auto",
        headers: { "User-Agent": USER_AGENT, Referer: `${origin}/` },
        subtitles: []
    }];
};

const getStreams = async (tmdbId, mediaType, season, episode) => {
    try {
        if (!/^\d+$/.test(String(tmdbId))) return [];
        const isTv = mediaType === "tv";
        if (isTv && (season == null || episode == null)) return [];

        const details = await fetchTmdbDetails(tmdbId, mediaType, isTv ? season : 0);
        const anime = details && details.titles.length ? await findAnime(details, isTv, isTv ? season : 0) : null;
        const episodeNumber = isTv ? Number(episode) : 1;
        if (!anime || !(episodeNumber >= 1)) return [];

        const series = await fetchSeries(anime.id);
        const seriesId = series && series.id != null ? series.id : anime.id;
        const anilistIdRaw = (series && series.anilistId) || anime.anilistId;
        const anilistId = anilistIdRaw != null ? String(anilistIdRaw).trim() : "";

        const episodes = (series && series.episodes) || [];
        const episodeEntry = episodes.find((entry) => entry && entry.number === episodeNumber);
        if (episodes.length && !episodeEntry) return [];

        let languages;
        if (episodeEntry) {
            languages = ["sub", "dub"].filter((language) => episodeEntry[language] === true);
        } else {
            languages = ["sub", "dub"].filter((language) => (anime[`${language}Count`] || 0) > 0);
            if (!languages.length) languages = ["sub", "dub"];
        }
        if (!languages.length) return [];

        const packagesPromise = anilistId
            ? fetchJson(`${BASE_URL}/api/anime/anipm-server/_packages?anilistId=${encodeURIComponent(anilistId)}`, `${BASE_URL}/`)
            : Promise.resolve(null);

        const seenSubtitles = new Set();
        const tasks = languages.map((language) =>
            fetchLanguageStreams(seriesId, episodeNumber, language, packagesPromise, seenSubtitles).catch(() => [])
        );
        if (anilistId) {
            tasks.push(
                fetchBetaStreams(anilistId, episodeNumber, languages.includes("sub"), languages.includes("dub")).catch(() => [])
            );
        }

        const streamLists = await Promise.all(tasks);
        const seenUrls = new Set();
        return streamLists.flat().filter((stream) => !seenUrls.has(stream.url) && seenUrls.add(stream.url));
    } catch {
        return [];
    }
};

module.exports = { getStreams };