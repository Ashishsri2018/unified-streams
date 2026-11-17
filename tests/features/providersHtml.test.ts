import { describe, expect, it } from 'vitest';
import { getProvidersScripts, renderProvidersPage } from '../../src/addon/providersHtml.js';

interface StubElement {
  className: string;
  innerHTML: string;
  textContent: string;
  value: string;
  addEventListener: (type: string, listener: () => void) => void;
}

type FetchImpl = () => Promise<unknown>;

function getElement(elements: Map<string, StubElement>, id: string): StubElement {
  const element = elements.get(id);
  if (!element) throw new Error(`missing stub element: ${id}`);
  return element;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

async function runProvidersScript(fetchImpl: FetchImpl): Promise<Map<string, StubElement>> {
  const elements = new Map<string, StubElement>();
  const document = {
    getElementById(id: string): StubElement {
      const existing = elements.get(id);
      if (existing) return existing;
      const element: StubElement = {
        className: '',
        innerHTML: '',
        textContent: '',
        value: '',
        addEventListener: () => undefined,
      };
      elements.set(id, element);
      return element;
    },
  };
  const run = new Function('document', 'fetch', 'setInterval', getProvidersScripts()) as (
    doc: typeof document,
    fetchFn: FetchImpl,
    setIntervalFn: (fn: () => void, ms: number) => void,
  ) => void;
  run(document, fetchImpl, () => undefined);
  await flush();
  return elements;
}

function report(stats: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    status: 'ok',
    ok: true,
    checkedAt: new Date().toISOString(),
    providers: { total: stats.length, stats },
  };
}

describe('working providers page', () => {
  it('lists only providers that returned streams, using ids without fleet labels', async () => {
    const elements = await runProvidersScript(async () => ({
      ok: true,
      status: 200,
      json: async () =>
        report([
          { component: 'vega', id: 'anikoto', state: 'closed', ok: 3, empty: 1 },
          { component: 'sa7', id: 'vidrock', state: 'closed', ok: 1, empty: 0 },
          { component: 'nuvio', id: 'emptyonly', state: 'closed', ok: 2, empty: 2 },
          { component: 'vega', id: 'opened', state: 'open', ok: 5, empty: 0 },
          { component: 'nuvio', id: 'quiet', state: 'closed', ok: 0, empty: 0 },
        ]),
    }));

    const list = getElement(elements, 'providers-list');
    const count = getElement(elements, 'providers-count');

    expect(list.innerHTML).toContain('anikoto');
    expect(list.innerHTML).toContain('vidrock');
    expect(list.innerHTML).not.toContain('emptyonly');
    expect(list.innerHTML).not.toContain('opened');
    expect(list.innerHTML).not.toContain('quiet');
    expect(list.innerHTML).not.toMatch(/vega|nuvio|sa7/i);
    expect(count.textContent).toBe('2 providers');
  });

  it('deduplicates the same provider id across sources', async () => {
    const elements = await runProvidersScript(async () => ({
      ok: true,
      status: 200,
      json: async () =>
        report([
          { component: 'vega', id: 'vidrock', state: 'closed', ok: 2, empty: 0 },
          { component: 'sa7', id: 'VIDROCK', state: 'closed', ok: 4, empty: 1 },
        ]),
    }));

    const list = getElement(elements, 'providers-list');
    const count = getElement(elements, 'providers-count');
    expect(list.innerHTML.match(/provider/g)?.length).toBe(1);
    expect(count.textContent).toBe('1 provider');
  });

  it('shows an empty state when no provider has returned streams', async () => {
    const elements = await runProvidersScript(async () => ({
      ok: true,
      status: 200,
      json: async () =>
        report([
          { component: 'vega', id: 'p1', state: 'closed', ok: 1, empty: 1 },
          { component: 'nuvio', id: 'p2', state: 'open', ok: 9, empty: 0 },
        ]),
    }));

    expect(getElement(elements, 'providers-list').innerHTML).toContain('No working providers observed yet');
    expect(getElement(elements, 'providers-count').textContent).toBe('0 providers');
  });

  it('parses a 503 health payload instead of treating it as unreachable', async () => {
    const elements = await runProvidersScript(async () => ({
      ok: false,
      status: 503,
      json: async () => report([{ component: 'sa7', id: 'vidrock', state: 'closed', ok: 1, empty: 0 }]),
    }));

    expect(getElement(elements, 'providers-list').innerHTML).toContain('vidrock');
    expect(getElement(elements, 'providers-updated').textContent).toContain('Checked');
  });

  it('reports a genuine transport failure', async () => {
    const elements = await runProvidersScript(async () => {
      throw new Error('Network down');
    });

    expect(getElement(elements, 'providers-list').innerHTML).toContain('Could not load providers');
    expect(getElement(elements, 'providers-updated').textContent).toContain('Health request failed: Network down');
  });

  it('renders a standalone page without source or fleet labels', () => {
    const html = renderProvidersPage({
      addonName: 'Unified Streams',
      logoUrl: 'http://example.test/logo.svg',
      configureUrl: 'http://example.test/configure',
      scriptNonce: 'nonce',
    });

    expect(html).toContain('Working providers');
    expect(html).toContain('providers-list');
    expect(html).not.toMatch(/nuvio|vega|sa7/i);
  });
});
