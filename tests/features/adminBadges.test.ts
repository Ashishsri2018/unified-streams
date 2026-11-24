import { describe, expect, it } from 'vitest';
import { renderAdminPage } from '../../src/addon/adminHtml.js';

interface StubElement {
  innerHTML: string;
  textContent: string;
  value: string;
  style: Record<string, string>;
  disabled: boolean;
  addEventListener: () => void;
  querySelectorAll: () => StubElement[];
}

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

function adminScript(): string {
  const html = renderAdminPage({
    addonName: 'Unified Streams',
    logoUrl: 'http://example.test/logo.svg',
    configureUrl: 'http://example.test/configure',
    scriptNonce: 'nonce',
    settings: undefined,
    version: 1,
    remoteBackupEnabled: false,
  });
  const match = /<script nonce="nonce">([\s\S]*?)<\/script>/.exec(html);
  if (!match) throw new Error('missing admin script');
  return match[1];
}

async function runAdminScript(): Promise<Map<string, StubElement>> {
  const elements = new Map<string, StubElement>();
  const document = {
    getElementById(id: string): StubElement {
      const existing = elements.get(id);
      if (existing) return existing;
      const element: StubElement = {
        innerHTML: '',
        textContent: '',
        value: '',
        style: {},
        disabled: false,
        addEventListener: () => undefined,
        querySelectorAll: () => [],
      };
      elements.set(id, element);
      return element;
    },
  };
  const catalog = {
    version: 1,
    fleets: [
      {
        fleet: 'nuvio',
        version: 1,
        error: null,
        providers: [
          {
            id: 'alpha',
            name: 'Alpha',
            types: ['movie'],
            enabled: true,
            loaded: true,
            locked: false,
            missing: false,
            lastError: null,
            version: '1.2.0',
            isNew: true,
            updated: false,
            previousVersion: null,
          },
          {
            id: 'beta',
            name: 'Beta',
            types: ['movie', 'tv'],
            enabled: true,
            loaded: true,
            locked: false,
            missing: false,
            lastError: null,
            version: '2.0.0',
            isNew: false,
            updated: true,
            previousVersion: '1.0.0',
          },
        ],
      },
    ],
  };
  const fetchImpl = async (url: string) => {
    if (url === '/admin/api/catalog') {
      return { ok: true, status: 200, json: async () => catalog };
    }
    return { ok: false, status: 503, json: async () => ({}) };
  };
  const window = { location: { href: '' } };
  const run = new Function('document', 'fetch', 'setInterval', 'window', adminScript()) as (
    doc: typeof document,
    fetchFn: typeof fetchImpl,
    setIntervalFn: () => void,
    win: typeof window,
  ) => void;
  run(document, fetchImpl, () => undefined, window);
  await flush();
  return elements;
}

describe('admin provider badges', () => {
  it('renders new, updated, and current version badges', async () => {
    const elements = await runAdminScript();
    const html = getElement(elements, 'provider-rows').innerHTML;

    expect(html).toContain('class="pill new"');
    expect(html).toContain('>new</span>');
    expect(html).toContain('class="pill updated"');
    expect(html).toContain('updated v1.0.0 \u2192 v2.0.0');
    expect(html).toContain('class="provider-version">v1.2.0</span>');
    expect(html).toContain('class="provider-version">v2.0.0</span>');
  });
});
