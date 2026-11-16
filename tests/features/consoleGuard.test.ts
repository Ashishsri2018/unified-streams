import { describe, it, expect } from 'vitest';
import { format } from 'node:util';
import {
  installConsoleGuard,
  redactConsoleLine,
  type ConsoleLike,
} from '../../src/core/logging/consoleGuard.js';

function createFakeConsole(): { console: ConsoleLike; lines: string[] } {
  const lines: string[] = [];
  const fake = {} as ConsoleLike;
  for (const method of ['log', 'info', 'debug', 'warn', 'error', 'dir', 'trace', 'table'] as const) {
    fake[method] = (...args: unknown[]) => lines.push(`${method}:${format(...args)}`);
  }
  return { console: fake, lines };
}

describe('console guard', () => {
  it('redacts urls and long tokens and collapses/truncates lines', () => {
    const line = redactConsoleLine(
      `link https://example.test/media?token=secret\nCookie: ext_name=abc; cf_clearance=${'A'.repeat(64)}`,
      80,
    );
    expect(line).not.toContain('https://');
    expect(line).not.toContain('A'.repeat(32));
    expect(line).toContain('[url]');
    expect(line).toContain('[redacted]');
    expect(line).not.toContain('\n');
    expect(line.length).toBeLessThanOrEqual(81);
  });

  it('rate limits within a one second window and reports suppressed messages', () => {
    const { console: fake, lines } = createFakeConsole();
    const suppressed: number[] = [];
    const now = 1_000;

    const uninstall = installConsoleGuard({
      target: fake,
      budgetPerSecond: 2,
      now: () => now,
      flushIntervalMs: 60_000,
      onSuppressed: (count) => suppressed.push(count),
    });

    fake.log('one');
    fake.info('two');
    fake.warn('three');
    fake.error('four');
    expect(lines).toEqual(['log:one', 'info:two']);

    uninstall();
    expect(suppressed).toEqual([2]);

    fake.log('after');
    expect(lines.at(-1)).toBe('log:after');
  });

  it('resets the budget after a second', () => {
    const { console: fake, lines } = createFakeConsole();
    let now = 0;
    const uninstall = installConsoleGuard({
      target: fake,
      budgetPerSecond: 1,
      now: () => now,
      flushIntervalMs: 60_000,
    });

    fake.log('first');
    fake.log('dropped');
    now = 1_001;
    fake.log('second');
    expect(lines).toEqual(['log:first', 'log:second']);

    uninstall();
  });
});
