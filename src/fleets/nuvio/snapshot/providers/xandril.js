const PROVIDER = "AniChan";
const BASE_URL = "https://anichan.to";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
const USER_AGENT = "Mozilla/5.0 (Linux; Android 17; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36";
const HEADERS = { "User-Agent": USER_AGENT, Accept: "application/json" };

async function request(url, headers, type) {
    try {
        const res = await fetch(url, { headers });
        return res.ok ? await res[type]() : null;
    } catch (e) {
        return null;
    }
}
const getJson = (url, headers) => request(url, headers, "json");
const getText = (url, headers) => request(url, headers, "text");
const api = (path) => getJson(BASE_URL + path, HEADERS);

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function b64ToBytes(t) {
    const s = String(t).replace(/[^A-Za-z0-9+/]/g, "");
    const out = new Uint8Array(Math.floor((s.length * 3) / 4));
    let acc = 0, bits = 0, n = 0;
    for (let i = 0; i < s.length; i++) {
        acc = (acc << 6) | B64.indexOf(s.charAt(i));
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out[n++] = (acc >> bits) & 0xff;
            acc &= (1 << bits) - 1;
        }
    }
    return out;
}
const asciiBytes = (s) => Uint8Array.from(s.split(""), (c) => c.charCodeAt(0) & 0xff);
const isHttp = (u) => String(u).indexOf("http") === 0;

function utf8Decode(buf) {
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    try {
        return decodeURIComponent(escape(bin));
    } catch (e) {
        return bin;
    }
}

const SHA_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x, n) => (x >>> n) | (x << (32 - n));

function sha256(data) {
    const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const len = data.length;
    const total = ((len + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(total);
    buf.set(data);
    buf[len] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, Math.floor(len / 0x20000000));
    dv.setUint32(total - 4, (len << 3) >>> 0);
    const w = new Uint32Array(64);
    for (let off = 0; off < total; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
        for (let i = 16; i < 64; i++) {
            const x = w[i - 15], y = w[i - 2];
            const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
            const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
        for (let i = 0; i < 64; i++) {
            const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (hh + S1 + ch + SHA_K[i] + w[i]) | 0;
            const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) | 0;
            hh = g; g = f; f = e; e = (d + t1) | 0;
            d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        h[0] += a; h[1] += b; h[2] += c; h[3] += d;
        h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
    }
    const out = new Uint8Array(32);
    const ov = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) ov.setUint32(i * 4, h[i]);
    return out;
}

function hmacSha256(key, msg) {
    let k = key.length > 64 ? sha256(key) : key;
    const ipad = new Uint8Array(64 + msg.length);
    const opad = new Uint8Array(96);
    for (let i = 0; i < 64; i++) {
        const kb = i < k.length ? k[i] : 0;
        ipad[i] = kb ^ 0x36;
        opad[i] = kb ^ 0x5c;
    }
    ipad.set(msg, 64);
    opad.set(sha256(ipad), 64);
    return sha256(opad);
}

const AES_SBOX = (() => {
    const sbox = new Uint8Array(256);
    const rotl8 = (x, s) => ((x << s) | (x >> (8 - s))) & 0xff;
    let p = 1, q = 1;
    do {
        p = (p ^ (p << 1) ^ (p & 0x80 ? 0x11b : 0)) & 0xff;
        q ^= (q << 1) & 0xff;
        q ^= (q << 2) & 0xff;
        q ^= (q << 4) & 0xff;
        if (q & 0x80) q ^= 0x09;
        sbox[p] = (q ^ rotl8(q, 1) ^ rotl8(q, 2) ^ rotl8(q, 3) ^ rotl8(q, 4) ^ 0x63) & 0xff;
    } while (p !== 1);
    sbox[0] = 0x63;
    return sbox;
})();

const xtime = (x) => ((x << 1) ^ (x & 0x80 ? 0x1b : 0)) & 0xff;

function aesExpandKey(key) {
    const w = new Uint8Array(240);
    w.set(key);
    let rcon = 1;
    for (let i = 8; i < 60; i++) {
        let t0 = w[i * 4 - 4], t1 = w[i * 4 - 3], t2 = w[i * 4 - 2], t3 = w[i * 4 - 1];
        if (i % 8 === 0) {
            const r = t0;
            t0 = AES_SBOX[t1] ^ rcon;
            t1 = AES_SBOX[t2];
            t2 = AES_SBOX[t3];
            t3 = AES_SBOX[r];
            rcon = xtime(rcon);
        } else if (i % 8 === 4) {
            t0 = AES_SBOX[t0]; t1 = AES_SBOX[t1]; t2 = AES_SBOX[t2]; t3 = AES_SBOX[t3];
        }
        w[i * 4] = w[i * 4 - 32] ^ t0;
        w[i * 4 + 1] = w[i * 4 - 31] ^ t1;
        w[i * 4 + 2] = w[i * 4 - 30] ^ t2;
        w[i * 4 + 3] = w[i * 4 - 29] ^ t3;
    }
    return w;
}

function aesEncryptBlock(w, input) {
    let s = new Uint8Array(16);
    for (let i = 0; i < 16; i++) s[i] = input[i] ^ w[i];
    const t = new Uint8Array(16);
    for (let round = 1; round <= 14; round++) {
        for (let c = 0; c < 4; c++) {
            for (let r = 0; r < 4; r++) t[r + 4 * c] = AES_SBOX[s[r + 4 * ((c + r) & 3)]];
        }
        if (round < 14) {
            for (let c = 0; c < 4; c++) {
                const a0 = t[c * 4], a1 = t[c * 4 + 1], a2 = t[c * 4 + 2], a3 = t[c * 4 + 3];
                const x0 = xtime(a0), x1 = xtime(a1), x2 = xtime(a2), x3 = xtime(a3);
                t[c * 4] = x0 ^ x1 ^ a1 ^ a2 ^ a3;
                t[c * 4 + 1] = a0 ^ x1 ^ x2 ^ a2 ^ a3;
                t[c * 4 + 2] = a0 ^ a1 ^ x2 ^ x3 ^ a3;
                t[c * 4 + 3] = x0 ^ a0 ^ a1 ^ a2 ^ x3;
            }
        }
        for (let i = 0; i < 16; i++) s[i] = t[i] ^ w[round * 16 + i];
    }
    return s;
}

function aesGcmDecrypt(key, iv, data) {
    if (key.length !== 32 || iv.length !== 12 || data.length < 16) return null;
    const w = aesExpandKey(key);
    const n = data.length - 16;
    const out = new Uint8Array(n);
    const ctr = new Uint8Array(16);
    ctr.set(iv);
    let counter = 2;
    for (let off = 0; off < n; off += 16) {
        ctr[12] = (counter >>> 24) & 0xff;
        ctr[13] = (counter >>> 16) & 0xff;
        ctr[14] = (counter >>> 8) & 0xff;
        ctr[15] = counter & 0xff;
        counter = (counter + 1) >>> 0;
        const ks = aesEncryptBlock(w, ctr);
        const end = Math.min(16, n - off);
        for (let i = 0; i < end; i++) out[off + i] = data[off + i] ^ ks[i];
    }
    return out;
}

function qualityFrom(label) {
    const m = /(2160|1440|1080|720|480|360)/.exec(label);
    return m ? m[1] + "p" : "Auto";
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function tokenOverlap(a, b) {
    const A = new Set(a.split(" "));
    const B = new Set(b.split(" "));
    let hit = 0;
    A.forEach((t) => { if (B.has(t)) hit++; });
    return hit / Math.max(A.size, B.size);
}

const SEASON_MARK = /\b(season|2nd|3rd|4th|5th|6th|part|cour|final|ii|iii|iv)\b/;

function scoreCandidate(c, opts) {
    let best = 0;
    const titles = [c.title, c.titleRomaji].filter(Boolean);
    for (const t of titles) {
        for (const n of opts.names) {
            const a = norm(t), b = norm(n);
            if (!a || !b) continue;
            const s = a === b ? 100 : Math.max(tokenOverlap(a, b) * 80, (a.includes(b) || b.includes(a)) ? 60 : 0);
            if (s > best) best = s;
        }
    }
    if (opts.year && c.startDate?.year) {
        const d = Math.abs(c.startDate.year - opts.year);
        if (d === 0) best += 30; else if (d === 1) best += 15;
    }
    if (opts.epCount && c.episodes && c.episodes === opts.epCount) best += 25;
    const marked = titles.some((t) => SEASON_MARK.test(norm(t)));
    if (opts.movie) {
        best += c.format === "MOVIE" ? 20 : -30;
    } else {
        if (c.format === "MOVIE") best -= 30;
        if (opts.season > 1) { if (marked) best += 10; } else if (marked) best -= 15;
    }
    return best;
}

async function pickBest(queries, opts) {
    const uniq = [...new Set(queries.filter(Boolean))].slice(0, 5);
    const lists = await Promise.all(uniq.map(async (q) => (await api("/api/suggest?q=" + encodeURIComponent(q)))?.results || []));
    const seen = new Set();
    let best = null, bestScore = -1;
    for (const c of [].concat(...lists)) {
        if (!c || !c.id || seen.has(c.id)) continue;
        seen.add(c.id);
        const s = scoreCandidate(c, opts);
        if (s > bestScore) { bestScore = s; best = c; }
    }
    return bestScore >= 70 ? best : null;
}

const yearOf = (d) => (d ? parseInt(String(d).slice(0, 4), 10) || 0 : 0);

async function mapToAniChan(tmdbId, mediaType, season, episode) {
    const d = await getJson(TMDB_API + "/" + mediaType + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&language=en-US", { Accept: "application/json" });
    if (!d) return null;

    if (mediaType === "movie") {
        const names = [d.title, d.original_title].filter(Boolean);
        const m = await pickBest(names, { names, year: yearOf(d.release_date), movie: true });
        return m ? { id: m.id, ep: 1 } : null;
    }

    const base = [d.name, d.original_name].filter(Boolean);
    const seasons = d.seasons || [];
    const sInfo = seasons.find((s) => s.season_number === season) || {};

    if (season === 1) {
        const m = await pickBest(base, {
            names: base, year: yearOf(d.first_air_date), epCount: sInfo.episode_count, season: 1,
        });
        return m ? { id: m.id, ep: episode } : null;
    }

    const generic = !sInfo.name || /^season \d+$/i.test(sInfo.name) || /^specials$/i.test(sInfo.name);
    const specific = [];
    for (const n of base) {
        specific.push(n + " season " + season, n + " " + season);
        if (!generic) specific.push(n + " " + sInfo.name);
    }
    if (!generic) specific.push(sInfo.name);
    const m = await pickBest(specific.concat(base), {
        names: specific, year: yearOf(sInfo.air_date), epCount: sInfo.episode_count, season: season,
    });
    if (m) return { id: m.id, ep: episode };

    let abs = episode;
    for (const s of seasons) if (s.season_number > 0 && s.season_number < season) abs += s.episode_count || 0;
    const first = await pickBest(base, { names: base, year: yearOf(d.first_air_date), season: 1 });
    return first ? { id: first.id, ep: abs } : null;
}

function createWatchClient() {
    const state = {
        session: null, pending: null, cookies: {}, hmacKey: null,
        keys: ["6be19f72", "wuEoOR48/o2oD14z71nB9MG2eC3T5q+uayZj5fb3Xsk=", "0Avpb+a3t0ihtp6DLmBkfB3wStHog0zOAhKALhnfeC4="],
        scans: 0, sealMisses: 0, emptyMisses: 0,
    };

    function headers(extra) {
        const h = { "User-Agent": USER_AGENT, Accept: "application/json", Referer: BASE_URL + "/", Origin: BASE_URL };
        const cookie = Object.keys(state.cookies).map((n) => n + "=" + state.cookies[n]).join("; ");
        if (cookie) h.Cookie = cookie;
        return Object.assign(h, extra);
    }

    function storeCookies(res) {
        try {
            const sc = res.headers.get("set-cookie");
            if (!sc) return;
            for (const part of sc.split(/,(?=\s*[A-Za-z0-9_\-.%]+=)/)) {
                const kv = part.split(";")[0].trim();
                const i = kv.indexOf("=");
                if (i > 0) state.cookies[kv.slice(0, i)] = kv.slice(i + 1);
            }
        } catch (e) { }
    }

    async function newSession(force) {
        if (!force && state.session?.n && state.session.exp * 1000 > Date.now() + 60000) return state.session;
        if (state.pending) return state.pending;
        if (force) state.session = null;
        state.pending = (async () => {
            try {
                const r = await fetch(BASE_URL + "/api/watch/session", {
                    method: "POST",
                    headers: headers({ "Content-Type": "application/json" }),
                    body: JSON.stringify({ token: "" }),
                });
                storeCookies(r);
                if (!r.ok) return null;
                const j = await r.json();
                if (j && j.n) state.session = j;
                return j || null;
            } catch (e) {
                return null;
            } finally {
                state.pending = null;
            }
        })();
        return state.pending;
    }

    function currentKey() {
        if (!state.hmacKey) {
            const a = b64ToBytes(state.keys[1]), b = b64ToBytes(state.keys[2]);
            state.hmacKey = a.map((v, i) => v ^ b[i]);
        }
        return [state.keys[0], state.hmacKey];
    }

    async function findBundleKeys() {
        if (state.scans >= 2) return false;
        state.scans++;
        try {
            const html = await getText(BASE_URL + "/", headers());
            if (!html) return false;
            const urls = Array.from(html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g), (m) => BASE_URL + m[1]);
            const triple = /["']([0-9a-f]{8})["'],[A-Za-z_$][\w$]*=["']([A-Za-z0-9+/=]{44})["'],[A-Za-z_$][\w$]*=["']([A-Za-z0-9+/=]{44})["']/;
            const texts = await Promise.all(urls.map((u) => getText(u, headers())));
            for (const t of texts) {
                if (!t) continue;
                const mm = triple.exec(t);
                if (mm && b64ToBytes(mm[2]).length === 32 && b64ToBytes(mm[3]).length === 32) {
                    const found = [mm[1], mm[2], mm[3]];
                    if (found.join() === state.keys.join()) return false;
                    state.keys = found;
                    state.hmacKey = null;
                    return true;
                }
            }
        } catch (e) { }
        return false;
    }

    function openSealed(j, nonce, key) {
        try {
            const aesKey = hmacSha256(key, asciiBytes(nonce));
            const plain = aesGcmDecrypt(aesKey, b64ToBytes(j.i), b64ToBytes(j.d));
            return plain ? JSON.parse(utf8Decode(plain)) : null;
        } catch (e) {
            return null;
        }
    }

    async function load(anilistId, ep, cat, tier) {
        for (let i = 0; i < 4; i++) {
            if (!state.session?.n && !(await newSession(false))?.n) continue;
            try {
                const pair = currentKey();
                const r = await fetch(
                    BASE_URL + "/api/watch/servers?anilistId=" + anilistId + "&ep=" + ep + "&category=" + cat + "&tier=" + tier,
                    { headers: headers({ "X-Wk": pair[0] }) }
                );
                if (r.status === 401) {
                    await newSession(true);
                    continue;
                }
                if (r.status === 429 || r.status >= 500) continue;
                if (!r.ok) return { servers: [] };
                let j = await r.json();
                if (j && j.v === 1) {
                    const opened = openSealed(j, state.session.n, pair[1]);
                    if (!opened) {
                        state.sealMisses++;
                        if (state.sealMisses >= 2) await findBundleKeys();
                        await newSession(true);
                        continue;
                    }
                    state.sealMisses = 0;
                    state.emptyMisses = 0;
                    j = opened;
                } else if (!j?.servers?.length) {
                    state.emptyMisses++;
                    if (state.emptyMisses >= 2 && (await findBundleKeys())) state.emptyMisses = 0;
                    continue;
                }
                return j || { servers: [] };
            } catch (e) { }
        }
        return { servers: [] };
    }

    async function downloads(anilistId, ep, firstCat) {
        const out = [];
        try {
            const url = BASE_URL + "/api/watch/ext-downloads?anilistId=" + anilistId + "&ep=" + ep;
            let r = await fetch(url, { headers: headers() });
            if (r.status === 401) {
                await newSession(true);
                r = await fetch(url, { headers: headers() });
            }
            if (r.ok) {
                const dj = await r.json();
                const bucket = dj && dj.kiwi ? (firstCat === "dub" ? dj.kiwi.dub : dj.kiwi.sub) : null;
                for (const q in bucket || {}) {
                    const u = bucket[q];
                    if (typeof u === "string" && isHttp(u)) {
                        out.push({ name: "kiwi", label: "Kiwi " + q, type: "embed", embed: u, subType: "soft" });
                    }
                }
            }
        } catch (e) { }
        return out;
    }

    async function fetchServers(anilistId, ep, cats) {
        await newSession(false);
        const perCat = await Promise.all(
            cats.map(async (cat) => {
                const acc = [];
                for (const tier of ["fast", "rest"]) {
                    const j = await load(anilistId, ep, cat, tier);
                    for (const sv of (j && j.servers) || []) {
                        if (cat === "hsub" && !sv.subType && sv.type === "hls") sv.subType = "hard";
                        acc.push(sv);
                    }
                }
                return acc;
            })
        );
        const merged = [];
        const seen = new Set();
        for (const sv of [].concat(...perCat)) {
            const key = sv.type === "embed" ? [sv.name, sv.label, sv.embed].join("|") : [sv.name, sv.label, sv.subType].join("|");
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(sv);
        }
        return merged.concat(await downloads(anilistId, ep, cats[0]));
    }

    return { fetchServers };
}

function unpackPacked(src) {
    const m = /\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/.exec(src);
    if (!m) return null;
    const payload = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
    const radix = parseInt(m[2], 10);
    let count = parseInt(m[3], 10);
    const dict = m[4].split("|");
    const toBase = (n) =>
        (n < radix ? "" : toBase(Math.floor(n / radix))) +
        (n % radix > 35 ? String.fromCharCode((n % radix) + 29) : (n % radix).toString(36));
    const lookup = {};
    while (count--) lookup[toBase(count)] = dict[count] || toBase(count);
    return payload.replace(/\b\w+\b/g, (w) => (lookup[w] !== undefined ? lookup[w] : w));
}

const locationOf = (r) => {
    const loc = r && r.headers.get("location");
    return loc && isHttp(loc) ? loc : null;
};

async function kiwiResolve(paheUrl) {
    const ph = { "User-Agent": USER_AGENT };
    const page = await getText(paheUrl, ph);
    if (!page) return null;
    const m = /const\s+url\s*=\s*"(https?:\/\/[^"]+)"/.exec(page) || /"(https?:\/\/[^"]*workers\.dev[^"]*)"/.exec(page);
    if (!m) return null;
    const redirector = m[1].replace(/\/+$/, "") + "/" + String(paheUrl).replace(/\/+$/, "").split("/").pop();
    let kwikUrl = null;
    try {
        kwikUrl = locationOf(await fetch(redirector, { headers: ph, redirect: "manual" }));
    } catch (e) { }
    if (!kwikUrl) return null;

    let res;
    try {
        res = await fetch(kwikUrl, { headers: Object.assign({ Referer: paheUrl }, ph) });
    } catch (e) { return null; }
    if (!res || !res.ok) return null;
    const html = await res.text();
    const pageUrl = res.url || kwikUrl;

    const at = html.indexOf("eval(function(p,a,c,k,e,");
    let unpacked = null;
    if (at >= 0) {
        const end = html.indexOf("</script>", at);
        try { unpacked = unpackPacked(html.slice(at, end > 0 ? end : undefined)); } catch (e) { }
    }
    const srcRe = /source\s*=\s*["']([^"']+)["']/;
    if (unpacked) {
        const s = srcRe.exec(unpacked);
        if (s && isHttp(s[1])) return { file: s[1], referer: pageUrl };
        const act = /action="([^"]+)"/.exec(unpacked);
        const tok = /value="([^"]+)"/.exec(unpacked);
        if (act && tok) {
            for (let i = 0; i < 10; i++) {
                try {
                    const r = await fetch(act[1], {
                        method: "POST",
                        headers: Object.assign({ Referer: pageUrl, "Content-Type": "application/x-www-form-urlencoded" }, ph),
                        body: "_token=" + encodeURIComponent(tok[1]),
                        redirect: "manual",
                    });
                    const loc = r && r.status === 302 && locationOf(r);
                    if (loc) return { file: loc, referer: pageUrl };
                } catch (e) { }
            }
        }
    }
    const s2 = srcRe.exec(html);
    if (s2 && isHttp(s2[1]) && (s2[1].includes(".m3u8") || s2[1].includes(".mp4"))) {
        return { file: s2[1], referer: pageUrl };
    }
    return null;
}

const SERVER_NAMES = {
    echovideo: "EchoVideo",
    vidstream: "VidStream",
    zoko: "Zoko",
    kaa: "Kaa",
};
const SERVER_ORDER = ["anichan", "vidstream", "echovideo", "hd-1", "hd-2", "kaa", "zoko"];

function rawLabel(sv) {
    return String(sv.label || sv.name || PROVIDER)
        .replace(/★/g, "")
        .replace(/\s*⧉\s*\(ads\)/g, "")
        .trim();
}

function prettyServer(label) {
    const m = /^(\S+)(.*)$/.exec(label);
    if (!m) return label;
    const mapped = SERVER_NAMES[m[1].toLowerCase()];
    return mapped ? mapped + m[2] : label;
}

function sortTag(server) {
    const idx = SERVER_ORDER.indexOf(server.toLowerCase().split(/\s+/)[0]);
    return (idx < 0 ? SERVER_ORDER.length : idx).toString(2).padStart(20, "0")
        .replace(/[01]/g, (b) => (b === "1" ? "\uFEFF" : "\u200B"));
}

function mkStream(language, hard, label, url, headers, subtitles) {
    const server = prettyServer(label);
    const lang = language + (hard ? " [Hard Sub]" : "");
    const display = sortTag(server) + (server.toLowerCase() === "anichan"
        ? PROVIDER + " • " + lang
        : PROVIDER + " • " + server + " • " + lang);
    const s = { name: display, title: display, url, quality: qualityFrom(label), headers };
    if (url.toLowerCase().includes(".m3u8")) s.type = "hls";
    if (subtitles && subtitles.length) s.subtitles = subtitles;
    return s;
}

async function convertServers(servers, category) {
    const language = category === "dub" ? "English" : "Japanese";
    const linkHeaders = { "User-Agent": USER_AGENT, Referer: BASE_URL + "/" };
    const isHard = (sv) => String(sv.subType || "").toLowerCase() === "hard";
    const streams = [];
    const kiwis = [];

    for (const sv of servers) {
        if (String(sv.type || "").toLowerCase() === "embed" && sv.embed) {
            if (sv.name === "kiwi") kiwis.push(sv);
            continue;
        }
        const st = sv.stream ? String(sv.stream) : "";
        const stream = isHttp(st) ? sv.stream : st.charAt(0) === "/" ? BASE_URL + sv.stream : null;
        if (!stream) continue;
        const subs = [];
        const seenLang = new Set();
        for (const sub of sv.subtitles || []) {
            if (!sub || !isHttp(sub.url)) continue;
            const lang = sub.lang || "English";
            if (seenLang.has(lang)) continue;
            seenLang.add(lang);
            subs.push({ url: sub.url, language: lang });
        }
        streams.push(mkStream(language, isHard(sv), rawLabel(sv), stream, linkHeaders, subs));
    }

    const resolved = await Promise.all(kiwis.map(async (sv) => {
        try {
            const k = await kiwiResolve(sv.embed);
            return k ? [mkStream(language, isHard(sv), rawLabel(sv), k.file, { "User-Agent": USER_AGENT, Referer: k.referer })] : [];
        } catch (e) {
            return [];
        }
    }));
    return streams.concat(...resolved);
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (!/^\d+$/.test(String(tmdbId))) return [];
        if (mediaType !== "movie" && mediaType !== "tv") return [];
        if (mediaType === "tv" && (season == null || episode == null || season < 1)) return [];
        if (!TMDB_KEY) return [];

        const target = await mapToAniChan(tmdbId, mediaType, season, episode);
        if (!target) return [];

        const [detail, info] = await Promise.all([
            api("/api/catalog/anime/" + target.id),
            api("/api/watch/episodes?anilistId=" + target.id),
        ]);
        const dubAvailable = info?.dubAvailable === true || !!detail?.selfhost?.cachedDub?.length;

        const client = createWatchClient();
        const run = async (cats, category) => {
            let servers = await client.fetchServers(target.id, target.ep, cats);
            if (!servers.length) servers = await client.fetchServers(target.id, target.ep, cats);
            return servers.length ? convertServers(servers, category) : [];
        };

        const [subStreams, dubStreams] = await Promise.all([
            run(["sub", "hsub"], "sub"),
            dubAvailable ? run(["dub"], "dub") : [],
        ]);

        const seen = new Set();
        return subStreams.concat(dubStreams).filter((s) => s.url && !seen.has(s.url) && seen.add(s.url));
    } catch (e) {
        return [];
    }
}

module.exports = { getStreams };