import { AsyncLocalStorage } from "node:async_hooks";
import * as cheerio from "cheerio";
import CryptoJS from "crypto-js";
import type { LoadedScraper, LoggerLike, NuvioScraperEntry } from "../types.js";
import type { NetworkTracker } from "../../../core/networkClassifier.js";
import { withTimeout } from "../util/concurrency.js";
import { nativeFetch } from "../util/nativeFetch.js";

const ON_SETTINGS_TIMEOUT_MS = 3000;

export interface ScraperNetworkContext {
  tracker: NetworkTracker;
  signal?: AbortSignal;
}

export const scraperNetworkStorage = new AsyncLocalStorage<ScraperNetworkContext>();

type EvaluatedModule = Record<string, unknown>;

export interface LoadScraperOptions {
  entry: NuvioScraperEntry;
  code: string;
  tmdbApiKey: string | null;
  envSettings: Record<string, unknown>;
  fetchTimeoutMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const MAX_PROVIDER_RESPONSE_BYTES = 16 * 1024 * 1024;
const BINARY_PROVIDER_CONTENT_TYPE =
  /^(?:video|audio|image|font)\/|(?:octet-stream|zip|rar|7z|gzip|x-tar|pdf)/i;
const TEXTUAL_PROVIDER_CONTENT_TYPE =
  /^(?:text\/|application\/(?:json|xml|javascript|ecmascript|x-www-form-urlencoded|ld\+json|rss\+xml|atom\+xml|xhtml\+xml|graphql))/i;
const MEDIA_OR_ARCHIVE_PATH =
  /\.(?:mkv|mp4|m4v|avi|mov|webm|flv|wmv|mpe?g|m2ts|zip|rar|7z|tar|gz|tgz|bz2|xz|zst|iso|mp3|aac|flac|wav|m4a|opus)$/i;

export class ProviderResponseLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderResponseLimitError";
  }
}

export interface ProviderResponseGuardOptions {
  maxBytes?: number;
  onOverflow?: (error: ProviderResponseLimitError) => void;
}

function safeUrlHost(rawUrl: string): string {
  try {
    return new URL(rawUrl).host;
  } catch {
    return "unknown";
  }
}

function safeUrlPath(rawUrl: string): string {
  try {
    return new URL(rawUrl).pathname;
  } catch {
    return "";
  }
}

function isBinaryContentType(contentType: string): boolean {
  const normalized = contentType.split(";")[0].trim().toLowerCase();
  if (!normalized || TEXTUAL_PROVIDER_CONTENT_TYPE.test(normalized)) return false;
  return BINARY_PROVIDER_CONTENT_TYPE.test(normalized);
}

/**
 * Scrapers should only parse HTML/JSON. Refuse direct media/archive downloads
 * and oversized bodies before a provider can buffer them with .text()/.json().
 */
export function guardProviderResponse(
  response: Response,
  requestedUrl: string,
  options: ProviderResponseGuardOptions = {},
): Response {
  const maxBytes = Math.max(1, options.maxBytes ?? MAX_PROVIDER_RESPONSE_BYTES);
  const contentType = response.headers.get("content-type") || "";
  const rawLength = response.headers.get("content-length");
  const contentLength = rawLength == null || rawLength === "" ? NaN : Number(rawLength);
  const finalUrl = response.url || requestedUrl || "";
  const host = safeUrlHost(finalUrl);

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    void response.body?.cancel().catch(() => undefined);
    throw new ProviderResponseLimitError(
      `blocked oversized response (${contentLength} bytes, ${contentType || "unknown type"}) from ${host}`,
    );
  }
  if (isBinaryContentType(contentType)) {
    void response.body?.cancel().catch(() => undefined);
    throw new ProviderResponseLimitError(`blocked binary response (${contentType}) from ${host}`);
  }
  const isMediaPath =
    MEDIA_OR_ARCHIVE_PATH.test(safeUrlPath(finalUrl)) ||
    MEDIA_OR_ARCHIVE_PATH.test(safeUrlPath(requestedUrl));
  if (isMediaPath) {
    void response.body?.cancel().catch(() => undefined);
    throw new ProviderResponseLimitError(`blocked media/archive response from ${host}`);
  }

  if (
    !response.body ||
    !response.ok ||
    response.status === 204 ||
    response.status === 205 ||
    response.status === 304
  ) {
    return response;
  }

  let total = 0;
  let overflowed = false;
  const limitedBody = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength;
        if (total > maxBytes) {
          if (!overflowed) {
            overflowed = true;
            const error = new ProviderResponseLimitError(
              `blocked oversized response (>${maxBytes} bytes) from ${host}`,
            );
            try {
              options.onOverflow?.(error);
            } catch {
              // Never let a telemetry callback mask the stream error.
            }
            controller.error(error);
          }
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );

  const guarded = new Response(limitedBody, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  Object.defineProperties(guarded, {
    url: { value: finalUrl, configurable: true },
    redirected: { value: response.redirected, configurable: true },
    type: { value: response.type, configurable: true },
  });
  return guarded;
}

export function createProviderFetch(
  timeoutMs: number,
  fetchImpl: typeof fetch = nativeFetch,
): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const context = scraperNetworkStorage.getStore();
    const tracker = context?.tracker;
    const startedAt = Date.now();
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url || "";
    const timeoutSignal = AbortSignal.timeout(Math.max(1, timeoutMs));
    const signals = [timeoutSignal];
    if (init?.signal) signals.push(init.signal);
    if (context?.signal) signals.push(context.signal);
    const signal = signals.length > 1 ? AbortSignal.any(signals) : timeoutSignal;
    try {
      const response = await fetchImpl(input, { ...init, signal });
      const guarded = guardProviderResponse(response, url, {
        onOverflow: (error) => {
          if (tracker) {
            tracker.record({
              url,
              ok: false,
              isTimeout: false,
              error: error.message,
              durationMs: Date.now() - startedAt,
            });
          }
        },
      });
      if (tracker) {
        tracker.record({
          url,
          status: response.status,
          ok: response.ok,
          isTimeout: false,
          durationMs: Date.now() - startedAt,
        });
      }
      return guarded;
    } catch (error) {
      if (tracker) {
        const isTimeout =
          error instanceof Error &&
          (error.name === "TimeoutError" ||
            error.name === "AbortError" ||
            error.message.toLowerCase().includes("abort") ||
            error.message.toLowerCase().includes("timeout"));
        tracker.record({
          url,
          ok: false,
          isTimeout,
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startedAt,
        });
      }
      throw error;
    }
  }) as typeof fetch;
}

const providerRequire = (id: string): unknown => {
  const name = id.trim();
  switch (name) {
    case "cheerio":
    case "cheerio-without-node-native":
      return cheerio;
    case "crypto-js":
      return CryptoJS;
    default:
      throw new Error(`Provider module is not available: ${name}`);
  }
};

function evaluateModule(options: {
  code: string;
  settings: Record<string, unknown>;
  tmdbApiKey: string | null;
  fetchTimeoutMs: number;
  filename: string;
}): EvaluatedModule {
  const moduleObject: { exports: Record<string, unknown> } = { exports: {} };
  const fn = new Function(
    "module",
    "exports",
    "require",
    "fetch",
    "TMDB_API_KEY",
    "SCRAPER_SETTINGS",
    "__filename",
    "__dirname",
    `"use strict";\n${options.code}`,
  ) as (...args: unknown[]) => void;

  fn(
    moduleObject,
    moduleObject.exports,
    providerRequire,
    createProviderFetch(options.fetchTimeoutMs),
    options.tmdbApiKey ?? undefined,
    options.settings,
    options.filename,
    "providers",
  );
  return moduleObject.exports;
}

async function collectDefaults(onSettings: unknown): Promise<Record<string, unknown>> {
  if (typeof onSettings !== "function") return {};
  let schema: unknown;
  try {
    schema = await withTimeout(
      Promise.resolve((onSettings as () => unknown)()),
      ON_SETTINGS_TIMEOUT_MS,
      "onSettings",
    );
  } catch {
    return {};
  }

  const fields = Array.isArray(schema)
    ? schema
    : isRecord(schema) && Array.isArray(schema.fields)
      ? schema.fields
      : [];
  const defaults: Record<string, unknown> = {};
  for (const field of fields) {
    if (!isRecord(field)) continue;
    const key = typeof field.key === "string" ? field.key : "";
    if (!key || field.defaultValue === undefined) continue;
    defaults[key] = field.defaultValue;
  }
  return defaults;
}

export async function loadScraper(options: LoadScraperOptions): Promise<LoadedScraper> {
  const settings: Record<string, unknown> = { ...options.envSettings };
  const base = {
    code: options.code,
    tmdbApiKey: options.tmdbApiKey,
    fetchTimeoutMs: options.fetchTimeoutMs,
    filename: options.entry.filename,
  };

  const evaluated = evaluateModule({ ...base, settings });
  if (typeof evaluated.getStreams !== "function") {
    throw new Error(`${options.entry.id} does not export getStreams()`);
  }

  const defaults = await collectDefaults(evaluated.onSettings);
  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in settings)) settings[key] = value;
  }

  const getStreams = evaluated.getStreams as (
    tmdbId: number,
    mediaType: "movie" | "tv",
    season?: number,
    episode?: number,
  ) => Promise<unknown>;

  return {
    entry: options.entry,
    settings,
    getStreams: async (tmdbId, mediaType, season, episode) => {
      const result = await getStreams(tmdbId, mediaType, season, episode);
      return Array.isArray(result) ? result : [];
    },
  };
}

export function scraperSupports(
  scraper: LoadedScraper,
  type: "movie" | "series",
): boolean {
  const types = scraper.entry.supportedTypes;
  if (type === "movie") return types.includes("movie");
  return types.includes("tv") || types.includes("series");
}

export function logScraperFailure(
  logger: LoggerLike,
  entry: NuvioScraperEntry,
  error: unknown,
): void {
  logger.warn("nuvio_scraper_load_failed", {
    scraper: entry.id,
    error: error instanceof Error ? error.message : String(error),
  });
}
