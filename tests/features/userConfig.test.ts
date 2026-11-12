import { describe, it, expect } from 'vitest';
import { encodeUserConfig, decodeUserConfig, DEFAULT_USER_CONFIG } from '../../src/addon/userConfig.js';

describe('userConfig encoding and decoding', () => {
  it('encodes and decodes v2 config correctly', () => {
    const config = {
      ...DEFAULT_USER_CONFIG,
      maxRes: 720,
      includeUnknownRes: false,
      maxSizeGB: 5.5,
      subtitleMode: 'languages' as const,
      subtitleLangs: ['en', 'hi'],
      backends: ['sa7' as const, 'nuvio' as const],
    };

    const encoded = encodeUserConfig(config);
    expect(typeof encoded).toBe('string');

    const decoded = decodeUserConfig(encoded);
    expect(decoded.maxRes).toBe(720);
    expect(decoded.includeUnknownRes).toBe(false);
    expect(decoded.maxSizeGB).toBe(5.5);
    expect(decoded.subtitleMode).toBe('languages');
    expect(decoded.subtitleLangs).toEqual(['en', 'hi']);
    expect(decoded.backends).toEqual(['sa7', 'nuvio']);
  });

  it('decodes legacy v1 config with fallback to v2 defaults', () => {
    const v1 = {
      backends: ['sa7', 'vega'],
    };
    const encodedV1 = Buffer.from(JSON.stringify(v1)).toString('base64url');
    const decoded = decodeUserConfig(encodedV1);

    expect(decoded.v).toBe(2);
    expect(decoded.backends).toEqual(['sa7', 'vega']);
    expect(decoded.maxRes).toBeNull();
    expect(decoded.subtitleMode).toBe('all');
  });

  it('safely handles invalid JSON and malformed input', () => {
    expect(decodeUserConfig('invalid-base64-string!@#$')).toEqual(DEFAULT_USER_CONFIG);
    expect(decodeUserConfig(undefined)).toEqual(DEFAULT_USER_CONFIG);
  });
});
