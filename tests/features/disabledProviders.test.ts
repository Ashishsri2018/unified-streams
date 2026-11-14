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
    expect(disabled).toContain('sylphera');
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
    expect(disabled).toContain('internetArchive');
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

  it('maps rogmovies / rogmovie alias to luxMovies in Vega disabled list', () => {
    const appEnv = loadAppEnv({
      VEGA_DISABLED_PROVIDERS: 'rogmovies',
    });
    const vegaEnv = deriveFleetEnv(appEnv, 'vega', 7003);
    const disabled = vegaEnv.DISABLED_PROVIDERS.split(',');
    expect(disabled).toContain('rogmovies');
    expect(disabled).toContain('luxMovies');
  });

  it('applies the Beamup profile with only its four providers and 40-way concurrency', () => {
    const appEnv = loadAppEnv({ INSTANCE_PROFILE: 'beamup' });
    expect(Number(appEnv.BACKEND_TIMEOUT_MS)).toBe(12000);
    expect(Number(appEnv.GLOBAL_DEADLINE_MS)).toBe(13000);
    expect(Number(appEnv.SEARCH_CONCURRENCY)).toBe(40);
    expect(Number(appEnv.SCRAPER_CONCURRENCY)).toBe(40);
    expect(Number(appEnv.SA7_CONCURRENCY)).toBe(40);

    const sa7Env = deriveFleetEnv(appEnv, 'sa7', 7001);
    expect(sa7Env.DISABLED_PROVIDERS.split(',')).toContain('*');
    expect(Number(sa7Env.PROVIDER_CONCURRENCY)).toBe(40);

    const nuvioEnv = deriveFleetEnv(appEnv, 'nuvio', 7002);
    expect(nuvioEnv.ENABLED_SCRAPERS).toBe('sylphera');
    expect(nuvioEnv.DISABLED_SCRAPERS.split(',')).not.toContain('sylphera');
    expect(nuvioEnv.SCRAPER_CONCURRENCY).toBe('40');

    const vegaEnv = deriveFleetEnv(appEnv, 'vega', 7003);
    const enabled = vegaEnv.ENABLED_PROVIDERS.split(',');
    expect(enabled).toContain('animeworld');
    expect(enabled).toContain('movies4u');
    expect(enabled).toContain('luxMovies');
    expect(vegaEnv.SEARCH_CONCURRENCY).toBe('40');
  });

  it('applies the Railway profile deny lists with 40-way concurrency', () => {
    const appEnv = loadAppEnv({ INSTANCE_PROFILE: 'railway' });
    expect(Number(appEnv.BACKEND_TIMEOUT_MS)).toBe(27000);
    expect(Number(appEnv.GLOBAL_DEADLINE_MS)).toBe(29000);
    expect(Number(appEnv.SEARCH_CONCURRENCY)).toBe(40);

    const sa7Env = deriveFleetEnv(appEnv, 'sa7', 7001);
    expect(sa7Env.DISABLED_PROVIDERS.split(',')).toContain('moviesdrive');
    expect(Number(sa7Env.PROVIDER_CONCURRENCY)).toBe(40);

    const nuvioEnv = deriveFleetEnv(appEnv, 'nuvio', 7002);
    expect(nuvioEnv.DISABLED_SCRAPERS.split(',')).toContain('sylphera');

    const vegaEnv = deriveFleetEnv(appEnv, 'vega', 7003);
    const disabled = vegaEnv.DISABLED_PROVIDERS.split(',');
    expect(disabled).toContain('animeworld');
    expect(disabled).toContain('movies4u');
    expect(disabled).toContain('luxMovies');
  });

  it('lets runtime env override profile provider selection without code changes', () => {
    const appEnv = loadAppEnv({
      INSTANCE_PROFILE: 'beamup',
      VEGA_DISABLED_PROVIDERS: 'animeworld',
      NUVIO_DISABLED_SCRAPERS: '*',
    });

    const vegaEnv = deriveFleetEnv(appEnv, 'vega', 7003);
    expect(vegaEnv.ENABLED_PROVIDERS.split(',')).not.toContain('animeworld');
    expect(vegaEnv.ENABLED_PROVIDERS.split(',')).toContain('movies4u');

    const nuvioEnv = deriveFleetEnv(appEnv, 'nuvio', 7002);
    expect(nuvioEnv.DISABLED_SCRAPERS.split(',')).toContain('*');
  });

  it('never re-enables hard-disabled providers through an allowlist', () => {
    const appEnv = loadAppEnv({
      INSTANCE_PROFILE: 'beamup',
      VEGA_ENABLED_PROVIDERS: 'torrentio,animeworld',
    });
    const vegaEnv = deriveFleetEnv(appEnv, 'vega', 7003);
    expect(vegaEnv.ENABLED_PROVIDERS).toBe('animeworld');
    expect(vegaEnv.DISABLED_PROVIDERS.split(',')).toContain('torrentio');
  });

  it('verifies baseline policy has sylphera, animeworld, movies4u, and luxMovies disabled by default', () => {
    const defaultEnv = loadAppEnv({});
    const nuvioEnv = deriveFleetEnv(defaultEnv, 'nuvio', 7002);
    const vegaEnv = deriveFleetEnv(defaultEnv, 'vega', 7003);

    expect(nuvioEnv.DISABLED_SCRAPERS.split(',')).toContain('sylphera');
    expect(vegaEnv.DISABLED_PROVIDERS.split(',')).toContain('animeworld');
    expect(vegaEnv.DISABLED_PROVIDERS.split(',')).toContain('movies4u');
    expect(vegaEnv.DISABLED_PROVIDERS.split(',')).toContain('luxMovies');
  });
});
