import { describe, expect, it } from 'vitest';
import { getStatusScripts } from '../../src/addon/statusHtml.js';

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
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
}

async function runStatusScript(fetchImpl: FetchImpl): Promise<Map<string, StubElement>> {
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
  const run = new Function('document', 'fetch', 'setInterval', getStatusScripts()) as (
    doc: typeof document,
    fetchFn: FetchImpl,
    setIntervalFn: (fn: () => void, ms: number) => void,
  ) => void;
  run(document, fetchImpl, () => undefined);
  await flush();
  return elements;
}

function errorReport(): Record<string, unknown> {
  return {
    status: 'error',
    ok: false,
    checkedAt: new Date().toISOString(),
    uptimeSec: 12,
    cache: { stream: { hits: 1, misses: 2, size: 3 } },
    components: [
      {
        name: 'sa7',
        displayName: 'SA7',
        status: 'error',
        ok: false,
        latencyMs: 5,
        health: { providers: { total: 1, circuits: { open: 0 } }, snapshot: { lastError: null } },
        process: { running: false, uptimeSec: 0 },
        error: 'Worker reported error',
      },
    ],
    providers: {
      total: 1,
      stats: [{ component: 'sa7', id: 'p1', state: 'open', calls: 1, ok: 0, errors: 1, lastError: 'boom' }],
    },
    metrics: { requests: 3, emptyResults: 1 },
  };
}

describe('status dashboard health refresh', () => {
  it('renders a 503 health payload instead of showing the dashboard as unreachable', async () => {
    const elements = await runStatusScript(async () => ({
      ok: false,
      status: 503,
      json: async () => errorReport(),
    }));

    const overall = getElement(elements, 'overall');
    const checked = getElement(elements, 'checked');
    const components = getElement(elements, 'components');
    expect(overall.innerHTML).toContain('error');
    expect(overall.innerHTML).not.toContain('unreachable');
    expect(checked.textContent).toContain('Checked');
    expect(checked.textContent).not.toContain('Health request failed');
    expect(components.innerHTML).toContain('SA7');
    expect(components.innerHTML).toContain('Worker reported error');
  });

  it('shows unreachable only for a genuine transport failure', async () => {
    const elements = await runStatusScript(async () => {
      throw new Error('Network down');
    });

    expect(getElement(elements, 'overall').innerHTML).toContain('unreachable');
    expect(getElement(elements, 'checked').textContent).toContain('Health request failed: Network down');
  });

  it('treats an unparseable body as a failed health request', async () => {
    const elements = await runStatusScript(async () => ({
      ok: false,
      status: 503,
      json: async () => {
        throw new SyntaxError('bad json');
      },
    }));

    expect(getElement(elements, 'checked').textContent).toContain('invalid JSON');
  });

  it('does not reject non-OK responses before parsing them', () => {
    expect(getStatusScripts()).not.toContain('if (!response.ok) throw');
  });
});
