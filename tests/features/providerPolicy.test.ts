import { describe, expect, it } from 'vitest';
import {
  buildProviderPolicyPayload,
  duplicateModeForProfile,
  isAdoptedUpstreamDisabled,
  isLockedProvider,
  isProviderEnabledByPolicy,
  loadProviderPolicy,
  parseProviderPolicyPayload,
  resolveDuplicateDenials,
  resolvePolicyProfileName,
} from '../../src/core/providerPolicy.js';

const config = loadProviderPolicy();

describe('provider policy resolution', () => {
  it('resolves profiles and duplicate modes', () => {
    expect(resolvePolicyProfileName(config, 'railway')).toBe('railway');
    expect(resolvePolicyProfileName(config, 'beamup')).toBe('beamup');
    expect(resolvePolicyProfileName(config, 'generic')).toBe('railway');
    expect(resolvePolicyProfileName(config, 'unknown')).toBe('railway');
    expect(duplicateModeForProfile(config, 'railway')).toBe('primary');
    expect(duplicateModeForProfile(config, 'beamup')).toBe('backup');
  });

  it('derives duplicate denials from duplicatePriority', () => {
    expect(resolveDuplicateDenials(config, 'railway', 'nuvio')).not.toContain('hexion');
    expect(resolveDuplicateDenials(config, 'railway', 'vega')).toContain('4khdhub');
    expect(resolveDuplicateDenials(config, 'railway', 'sa7')).toContain('moviebox');
    expect(resolveDuplicateDenials(config, 'beamup', 'nuvio')).toContain('hexion');
    expect(resolveDuplicateDenials(config, 'beamup', 'vega')).not.toContain('4khdhub');
  });

  it('builds a worker payload with locked, disabled, and overrides', () => {
    const payload = buildProviderPolicyPayload(
      config,
      'railway',
      'vega',
      { animeworld: true, torrentio: true },
      4,
    );
    expect(payload.version).toBe(4);
    expect(payload.locked).toContain('torrentio');
    expect(payload.disabled).toContain('4khdhub');
    expect(payload.overrides).toEqual({ animeworld: true, torrentio: true });
    expect(isProviderEnabledByPolicy('torrentio', payload)).toBe(false);
    expect(isProviderEnabledByPolicy('animeworld', payload)).toBe(true);
  });

  it('keeps locked and adoption helpers case-insensitive', () => {
    expect(isLockedProvider('TORRENTIO', config.locked)).toBe(true);
    expect(isLockedProvider('unknown', config.locked)).toBe(false);
    expect(
      isAdoptedUpstreamDisabled('Some-Provider', {
        adoptUpstreamDisabled: ['some-provider'],
      }),
    ).toBe(true);
    expect(
      isAdoptedUpstreamDisabled('other', { adoptUpstreamDisabled: ['some-provider'] }),
    ).toBe(false);
  });

  it('parses invalid payloads as empty policy', () => {
    expect(parseProviderPolicyPayload(undefined)).toEqual({
      version: 0,
      locked: [],
      disabled: [],
      overrides: {},
      adoptUpstreamDisabled: [],
    });
    expect(parseProviderPolicyPayload('{bad json')).toEqual({
      version: 0,
      locked: [],
      disabled: [],
      overrides: {},
      adoptUpstreamDisabled: [],
    });
  });
});
