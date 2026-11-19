const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
const API_BASE = "https://streamdata.vaplayer.ru";
const REFERER = "https://nextgencloudfabric.com/";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
    "Referer": REFERER,
    "Origin": REFERER,
};

async function fetchImdbId(tmdbId, mediaType) {
    try {
        const endpoint = mediaType === "tv" ? "tv" : "movie";
        const url = `${TMDB_API}/${endpoint}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids`;
        const res = await fetch(url, { headers: { "User-Agent": HEADERS["User-Agent"], "Accept": "application/json" } });
        if (!res.ok) return null;
        const data = await res.json();
        return data?.external_ids?.imdb_id || null;
    } catch {
        return null;
    }
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const imdbId = await fetchImdbId(tmdbId, mediaType);
        if (!imdbId) return [];

        const url = (season != null && episode != null)
            ? `${API_BASE}/api.php?imdb=${imdbId}&type=tv&season=${season}&episode=${episode}`
            : `${API_BASE}/api.php?imdb=${imdbId}&type=movie`;

        const res = await fetch(url, { headers: { ...HEADERS, "Accept": "application/json" } });
        if (!res.ok) return [];

        const data = await res.json();
        if (!data || data.status_code === "error" || !data.data) return [];

        const payload = data.data;
        const source = payload.stream_urls ?? payload.stream_url ?? payload.cast_urls ?? payload.urls ?? payload.sources;
        let rawItems = [];
        if (Array.isArray(source)) {
            rawItems = source;
        } else if (typeof source === "string") {
            rawItems = [source];
        } else if (source && typeof source === "object") {
            rawItems = Object.values(source);
        }

        const streamMap = new Map();

        for (const item of rawItems) {
            let streamUrl = "";

            if (typeof item === "string") {
                streamUrl = item;
            } else if (item && typeof item === "object") {
                streamUrl = item.url || item.file || item.src || "";
            } else {
                continue;
            }

            if (!streamUrl) continue;

            const cleanUrl = streamUrl.trim().replace(/\/+$/, "");
            if (!streamMap.has(cleanUrl)) {
                streamMap.set(cleanUrl, cleanUrl);
            }
        }

        if (streamMap.size === 0) return [];

        const qualityFrom = (value) => {
            const text = String(value || "");
            const match = text.match(/\b(2160|1440|1080|720|480|360)\s*p\b/i);
            if (match) return `${match[1]}p`;
            return /\b(4k|uhd)\b/i.test(text) ? "2160p" : "Auto";
        };
        const quality = qualityFrom(payload.file_name) !== "Auto"
            ? qualityFrom(payload.file_name)
            : qualityFrom(payload.title);

        const subs = payload.default_subs || data.default_subs || [];
        const subtitles = (Array.isArray(subs) ? subs : [])
            .filter(s => s.url)
            .map(s => ({
                url: s.url,
                language: s.code || s.lang || "unknown",
                name: s.lang || s.code || "Unknown",
            }));

        return [...streamMap.values()].map(url => ({
            name: "VAplayer",
            title: quality === "Auto" ? "VAplayer" : `VAplayer • ${quality}`,
            url,
            quality,
            headers: HEADERS,
            subtitles,
        }));
    } catch {
        return [];
    }
}

module.exports = { getStreams };