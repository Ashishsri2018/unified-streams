import { describe, it, expect } from 'vitest';
import { deriveFleetEnv, loadAppEnv } from '../../src/core/env.js';

describe('disabled providers derivation', () => {
  it('merges NUVIO_DISABLED_SCRAPERS and strips surrounding quotes', () => {
    const rawList = "'fjoral,xylos,maelith,xandril,vitrix,ozeris,ilvyrel,solunix,qorva,lenyr,phraxis,praxiel'";
    const appEnv = loadAppEnv({
      NUVIO_DISABLED_SCRAPERS: rawList,
    });
    const nuvioEnv = deriveFleetEnv(appEnv, 'nuvio', 7002);

    expect(nuvioEnv.DISABLED_SCRAPERS).toBeDefined();
    const disabled = nuvioEnv.DISABLED_SCRAPERS.split(',');
    expect(disabled).toContain('fjoral');
    expect(disabled).toContain('xylos');
    expect(disabled).toContain('praxiel');
    expect(disabled).not.toContain("'fjoral");
    expect(disabled).not.toContain("praxiel'");
    // Baseline deny list must also be preserved
    expect(disabled).toContain('bdix-cf');
    expect(disabled).toContain('zyrvael');
  });

  it('merges VEGA_DISABLED_PROVIDERS and strips surrounding quotes', () => {
    const rawList = '"4khdhub,autoEmbed,showbox,hdhub4u,vega"';
    const appEnv = loadAppEnv({
      VEGA_DISABLED_PROVIDERS: rawList,
    });
    const vegaEnv = deriveFleetEnv(appEnv, 'vega', 7003);

    expect(vegaEnv.DISABLED_PROVIDERS).toBeDefined();
    const disabled = vegaEnv.DISABLED_PROVIDERS.split(',');
    expect(disabled).toContain('4khdhub');
    expect(disabled).toContain('autoEmbed');
    expect(disabled).toContain('showbox');
    expect(disabled).toContain('hdhub4u');
    expect(disabled).toContain('vega');
    expect(disabled).not.toContain('"4khdhub');
    expect(disabled).not.toContain('vega"');
    // Baseline deny list must also be preserved
    expect(disabled).toContain('torrentio');
    expect(disabled).toContain('disneyMirror');
  });

  it('merges SA7_DISABLED_PROVIDERS and strips surrounding quotes', () => {
    const rawList = "'redflix,desiflix,vidrock'";
    const appEnv = loadAppEnv({
      SA7_DISABLED_PROVIDERS: rawList,
    });
    const sa7Env = deriveFleetEnv(appEnv, 'sa7', 7001);

    expect(sa7Env.DISABLED_PROVIDERS).toBeDefined();
    const disabled = sa7Env.DISABLED_PROVIDERS.split(',');
    expect(disabled).toContain('redflix');
    expect(disabled).toContain('desiflix');
    expect(disabled).toContain('vidrock');
    expect(disabled).not.toContain("'redflix");
    expect(disabled).not.toContain("vidrock'");
    // Baseline deny list must also be preserved
    expect(disabled).toContain('moviesdrive');
    expect(disabled).toContain('torrentio');
  });

  it('allows customizing disabled providers per instance without code changes', () => {
    const customAppEnv = loadAppEnv({
      SA7_DISABLED_PROVIDERS: 'redflix',
      NUVIO_DISABLED_SCRAPERS: 'fjoral',
      VEGA_DISABLED_PROVIDERS: 'showbox',
    });

    const sa7Env = deriveFleetEnv(customAppEnv, 'sa7', 7001);
    const nuvioEnv = deriveFleetEnv(customAppEnv, 'nuvio', 7002);
    const vegaEnv = deriveFleetEnv(customAppEnv, 'vega', 7003);

    expect(sa7Env.DISABLED_PROVIDERS.split(',')).toContain('redflix');
    expect(nuvioEnv.DISABLED_SCRAPERS.split(',')).toContain('fjoral');
    expect(vegaEnv.DISABLED_PROVIDERS.split(',')).toContain('showbox');
  });
});
