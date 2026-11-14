import { describe, it, expect } from 'vitest';
import {
  createNetworkTracker,
  classifyEmptyResult,
} from '../../src/core/networkClassifier.js';

describe('networkClassifier', () => {
  it('classifies genuine catalog miss as empty when all requests succeed', () => {
    const tracker = createNetworkTracker();
    tracker.record({
      url: 'https://example.com/search?q=movie',
      status: 200,
      ok: true,
      isTimeout: false,
      durationMs: 150,
    });

    const result = classifyEmptyResult(tracker, 200, 5000);
    expect(result.outcome).toBe('empty');
    expect(result.lastError).toBeNull();
  });

  it('classifies as empty when no network requests were attempted', () => {
    const tracker = createNetworkTracker();
    const result = classifyEmptyResult(tracker, 10, 5000);
    expect(result.outcome).toBe('empty');
    expect(result.lastError).toBeNull();
  });

  it('classifies as error when all network requests return HTTP 404', () => {
    const tracker = createNetworkTracker();
    tracker.record({
      url: 'https://streamdata.vaplayer.ru/api.php?tmdb=550',
      status: 404,
      ok: false,
      isTimeout: false,
      error: 'HTTP 404',
      durationMs: 300,
    });

    const result = classifyEmptyResult(tracker, 350, 5000);
    expect(result.outcome).toBe('error');
    expect(result.lastError).toBe('HTTP 404');
  });

  it('classifies as error when network connection fails (DNS/Refused)', () => {
    const tracker = createNetworkTracker();
    tracker.record({
      url: 'https://moviesleech.club/search',
      ok: false,
      isTimeout: false,
      error: 'getaddrinfo ENOTFOUND moviesleech.club',
      durationMs: 50,
    });

    const result = classifyEmptyResult(tracker, 60, 5000);
    expect(result.outcome).toBe('error');
    expect(result.lastError).toContain('ENOTFOUND');
  });

  it('classifies as timeout when request times out or is aborted', () => {
    const tracker = createNetworkTracker();
    tracker.record({
      url: 'https://redflix.biz/search',
      ok: false,
      isTimeout: true,
      error: 'The operation was aborted',
      durationMs: 5000,
    });

    const result = classifyEmptyResult(tracker, 5020, 5000);
    expect(result.outcome).toBe('timeout');
    expect(result.lastError).toContain('aborted');
  });

  it('classifies as timeout when provider execution exceeds timeout budget', () => {
    const tracker = createNetworkTracker();
    tracker.record({
      url: 'https://slow.host/search',
      status: 200,
      ok: true,
      isTimeout: false,
      durationMs: 4900,
    });

    const result = classifyEmptyResult(tracker, 4950, 5000);
    expect(result.outcome).toBe('timeout');
    expect(result.lastError).toBe('provider execution timeout');
  });

  it('classifies downstream pipeline failure as error when stream resolver fails', () => {
    const tracker = createNetworkTracker();
    // Search succeeded
    tracker.record({
      url: 'https://example.com/search?q=movie',
      status: 200,
      ok: true,
      isTimeout: false,
      durationMs: 120,
    });
    // Stream link extraction failed
    tracker.record({
      url: 'https://example.com/api/stream/123',
      status: 500,
      ok: false,
      isTimeout: false,
      error: 'HTTP 500',
      durationMs: 250,
    });

    const result = classifyEmptyResult(tracker, 400, 5000);
    expect(result.outcome).toBe('error');
    expect(result.lastError).toBe('HTTP 500');
  });

  it('verifies SA7 plain JS tracker integration', async () => {
    // Dynamic import of SA7 CJS module
    const { createTracker, classifyEmptyResult: sa7Classify } = await import(
      // @ts-expect-error CJS module
      '../../src/fleets/sa7/lib/tracker.js'
    );
    const sa7Tracker = createTracker();
    sa7Tracker.attempts.push({
      url: 'https://streamdata.vaplayer.ru/api.php?tmdb=550',
      status: 404,
      ok: false,
      isTimeout: false,
      error: 'HTTP 404',
      durationMs: 200,
    });
    const result = sa7Classify(sa7Tracker, 210, 5000);
    expect(result.outcome).toBe('error');
    expect(result.lastError).toBe('HTTP 404');
  });
});
