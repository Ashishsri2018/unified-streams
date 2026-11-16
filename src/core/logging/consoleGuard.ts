import { format } from 'node:util';

export type ConsoleMethod =
  | 'log'
  | 'info'
  | 'debug'
  | 'warn'
  | 'error'
  | 'dir'
  | 'trace'
  | 'table';

export type ConsoleLike = Record<ConsoleMethod, (...args: unknown[]) => void>;

export interface ConsoleGuardOptions {
  target?: ConsoleLike;
  budgetPerSecond?: number;
  maxLineLength?: number;
  flushIntervalMs?: number;
  onSuppressed?: (count: number) => void;
  now?: () => number;
}

const METHODS: ConsoleMethod[] = [
  'log',
  'info',
  'debug',
  'warn',
  'error',
  'dir',
  'trace',
  'table',
];

const URL_PATTERN = /https?:\/\/[^\s'"]+/g;
const LONG_TOKEN_PATTERN = /[A-Za-z0-9_+/=-]{32,}/g;

export function redactConsoleLine(line: string, maxLineLength = 500): string {
  const collapsed = line.replace(/\s+/g, ' ').trim();
  const redacted = collapsed
    .replace(URL_PATTERN, '[url]')
    .replace(LONG_TOKEN_PATTERN, '[redacted]');
  return redacted.length > maxLineLength
    ? `${redacted.slice(0, maxLineLength)}…`
    : redacted;
}

/**
 * Vendored provider code writes to the global console far faster than Railway's
 * 500 lines/sec ingest limit and often includes signed URLs or cookies. Throttle
 * every console method to one redacted line per call and report how many were
 * dropped instead of letting provider noise crowd out structured gateway logs.
 */
export function installConsoleGuard(options: ConsoleGuardOptions = {}): () => void {
  const target = options.target ?? (console as unknown as ConsoleLike);
  const budgetPerSecond = Math.max(1, options.budgetPerSecond ?? 20);
  const maxLineLength = options.maxLineLength ?? 500;
  const flushIntervalMs = options.flushIntervalMs ?? 10_000;
  const now = options.now ?? Date.now;

  const originals = new Map<ConsoleMethod, (...args: unknown[]) => void>();
  for (const method of METHODS) {
    const original = target[method];
    originals.set(method, (...args: unknown[]) => original(...args));
  }

  let windowStart = now();
  let emitted = 0;
  let suppressed = 0;

  const flush = (): void => {
    if (suppressed === 0) return;
    const count = suppressed;
    suppressed = 0;
    options.onSuppressed?.(count);
  };

  const timer = setInterval(flush, flushIntervalMs);
  timer.unref?.();

  const write = (method: ConsoleMethod, args: unknown[]): void => {
    const current = now();
    if (current - windowStart >= 1000) {
      windowStart = current;
      emitted = 0;
    }
    if (emitted >= budgetPerSecond) {
      suppressed += 1;
      return;
    }
    emitted += 1;
    originals.get(method)?.(redactConsoleLine(format(...args), maxLineLength));
  };

  for (const method of METHODS) {
    target[method] = (...args: unknown[]) => write(method, args);
  }

  return () => {
    clearInterval(timer);
    flush();
    for (const method of METHODS) {
      const original = originals.get(method);
      if (original) target[method] = original;
    }
  };
}
