const BASE_URL = "https://jerso441ceg.com";
const API_BASE = "https://links.watchkar.com"
const TMDB_URL = "https://api.themoviedb.org/3";
const TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";

const parseJson = (text) => {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};

const originHeaders = (origin, referer = `${origin}/`) => ({
    "User-Agent": USER_AGENT,
    Referer: referer,
    Origin: origin,
});

async function request(url, { method = "GET", headers } = {}) {
    try {
        const res = await fetch(url, {
            method,
            headers: { "User-Agent": USER_AGENT, ...headers },
            ...(method === "POST" && { body: "" }),
        });
        return res.ok ? (await res.text()).trim() : null;
    } catch {
        return null;
    }
}

const getText = (url, headers) => request(url, { headers });
const getJson = async (url, headers) => parseJson(await request(url, { headers }));

const post = (url, headers) =>
    request(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    });

function createStream({ url, quality = "1080p", audio, headers }) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    return {
        name: ["DooFlix", audio].filter(Boolean).join(" \u2022 "),
        title: ["DooFlix", audio].filter(Boolean).join(" \u2022 "),
        url: parsed.href.replace(/\[/g, "%5B").replace(/\]/g, "%5D"),
        quality,
        type: parsed.pathname.toLowerCase().endsWith(".m3u8") ? "m3u8" : "video",
        ...(headers && { headers }),
    };
}

function decodeFlightPayload(html) {
    let payload = "";
    if (!html) return payload;
    const marker = 'self.__next_f.push([1,"';
    let index = html.indexOf(marker);
    while (index >= 0) {
        const start = index + marker.length;
        let end = start;
        while (end < html.length && html[end] !== '"') end += html[end] === "\\" ? 2 : 1;
        const chunk = parseJson(`"${html.slice(start, end)}"`);
        if (chunk) payload += chunk;
        index = html.indexOf(marker, end);
    }
    return payload;
}

function readConfigField(source, field) {
    const pattern = new RegExp(
        `(?:^|[\\s,{])["']?${field}["']?\\s*:\\s*(["'])((?:\\\\.|(?!\\1)[^\\\\])*)\\1`
    );
    const match = pattern.exec(source);
    return match ? match[2].replace(/\\(.)/g, "$1") : null;
}

function parsePlayerConfig(html) {
    const anchor = /(?:let\s+p3\s*=|HDVBPlayer\()\s*\{/.exec(html || "");
    if (!anchor) return null;
    const source = html.slice(anchor.index + anchor[0].length - 1);
    const key = readConfigField(source, "key");
    const file = readConfigField(source, "file");
    return key && file ? { key, file } : null;
}

function findFolder(nodes, field, value) {
    if (!Array.isArray(nodes)) return null;
    const node = nodes.find((candidate) => candidate && candidate[field] === value);
    return (node && node.folder) || null;
}

function resolveEntries(playlist, context) {
    if (!context.isSeries) return playlist;
    const seasonFolder = findFolder(playlist, "id", String(context.season));
    return findFolder(seasonFolder, "episode", String(context.episode));
}

async function fetchTmdbDetails(tmdbId, isSeries) {
    const data = await getJson(
        `${TMDB_URL}/${isSeries ? "tv" : "movie"}/${tmdbId}?api_key=${TMDB_KEY}&language=en&append_to_response=external_ids`
    );
    const imdbId = data?.external_ids?.imdb_id ?? data?.imdb_id;
    return { imdbId: /^tt\d+$/.test(imdbId ?? "") ? imdbId : null };
}

async function fetchCacheStreams(context) {
    const key = context.isSeries
        ? `tv_${context.tmdbId}_s${context.season}_e${context.episode}`
        : `movie_${context.tmdbId}`;
    const cache = await getJson(
        `${BASE_URL}/m2download/m2download_cache.php?type=${context.isSeries ? "tv" : "movie"}&key=${encodeURIComponent(key)}`
    );

    const pages = new Map();
    for (const entry of cache?.data ?? []) {
        const url = entry?.stablePageUrl;
        if (url && String(entry.provider).toUpperCase() === "DOTFLIX" && !pages.has(url)) {
            pages.set(url, { url, quality: entry.quality || "1080p" });
        }
    }

    const streams = await Promise.all(
        [...pages.values()].map(async (page) => {
            const payload = decodeFlightPayload(await getText(page.url, { Referer: page.url }));
            const url = (payload.match(/"cloudflareFileUrl":"(https?:\/\/[^"]+)"/) || [])[1];
            return url ? createStream({ url, quality: page.quality }) : null;
        })
    );
    return streams.filter(Boolean);
}

async function fetchPlayerStreams(context) {
    if (!context.imdbId) return [];

    const playUrl = `${BASE_URL}/play/${context.imdbId}`;
    const config = parsePlayerConfig(await getText(playUrl, { Referer: `${BASE_URL}/` }));
    if (!config) return [];

    const listUrl = new URL(config.file, playUrl);
    const playlist = parseJson(
        await post(listUrl.href, { "X-CSRF-TOKEN": config.key, ...originHeaders(BASE_URL, playUrl) })
    );
    if (!Array.isArray(playlist)) return [];

    const entries = resolveEntries(playlist, context);
    if (!entries) return [];

    const streams = await Promise.all(
        entries.map(async (entry) => {
            const file = String(entry?.file ?? "").replace(/^~/, "").trim();
            if (!file) return null;
            const body = await post(`${listUrl.origin}/playlist/${file}.txt`, {
                "X-CSRF-TOKEN": config.key,
                ...originHeaders(listUrl.origin, listUrl.href),
            });
            const url = (body || "").replace(/^"|"$/g, "");
            if (!url.startsWith("http")) return null;
            const language = String(entry.title || "");
            return createStream({
                url,
                audio: language !== "Multi" ? language : "",
                headers: originHeaders(listUrl.origin),
            });
        })
    );
    return streams.filter(Boolean);
}

async function getStreams(tmdbId, mediaType, season, episode) {
    if (!/^\d+$/.test(String(tmdbId))) return [];

    const isSeries = mediaType === "tv";
    const seasonNumber = parseInt(season, 10);
    const episodeNumber = parseInt(episode, 10);
    if (isSeries && (isNaN(seasonNumber) || isNaN(episodeNumber))) return [];

    const details = await fetchTmdbDetails(tmdbId, isSeries);
    const context = {
        tmdbId: String(tmdbId),
        isSeries,
        season: seasonNumber,
        episode: episodeNumber,
        ...details,
    };
    const PROVIDERS = [fetchCacheStreams, fetchPlayerStreams];
    const results = await Promise.allSettled(PROVIDERS.map((provider) => provider(context)));
    const streams = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
    return [...new Map(streams.map((stream) => [stream.url, stream])).values()];
}

module.exports = { getStreams };