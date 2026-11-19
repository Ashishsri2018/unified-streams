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

  it('applies the Beamup profile while enabling new providers by default', () => {
    const appEnv = loadAppEnv({ INSTANCE_PROFILE: 'beamup' });
    expect(Number(appEnv.BACKEND_TIMEOUT_MS)).toBe(12000);
    expect(Number(appEnv.GLOBAL_DEADLINE_MS)).toBe(13000);
    expect(Number(appEnv.SEARCH_CONCURRENCY)).toBe(40);
    expect(Number(appEnv.SCRAPER_CONCURRENCY)).toBe(40);
    expect(Number(appEnv.SA7_CONCURRENCY)).toBe(40);

    const sa7Env = deriveFleetEnv(appEnv, 'sa7', 7001);
    const sa7Disabled = sa7Env.DISABLED_PROVIDERS.split(',');
    expect(sa7Env.ENABLED_PROVIDERS).toBeUndefined();
    expect(sa7Disabled).not.toContain('*');
    expect(sa7Disabled).not.toContain('moviesdrive');
    expect(sa7Disabled).not.toContain('4khdhub');
    expect(sa7Disabled).not.toContain('hdhub4u');
    expect(sa7Disabled).not.toContain('vegamovies');
    expect(sa7Disabled).not.toContain('castle');
    expect(sa7Disabled).not.toContain('anizone');
    expect(sa7Disabled).not.toContain('moviebox');
    expect(sa7Disabled).not.toContain('moviesmod');
    expect(sa7Disabled).not.toContain('reanime');
    expect(sa7Disabled).not.toContain('animeworld');
    expect(sa7Disabled).not.toContain('animesalt');
    expect(sa7Disabled).not.toContain('anizen');
    expect(sa7Disabled).not.toContain('anikage');
    expect(sa7Disabled).toContain('redflix');
    expect(sa7Disabled).toContain('kurage');
    expect(Number(sa7Env.PROVIDER_CONCURRENCY)).toBe(40);

    const nuvioEnv = deriveFleetEnv(appEnv, 'nuvio', 7002);
    const nuvioDisabled = nuvioEnv.DISABLED_SCRAPERS.split(',');
    expect(nuvioEnv.ENABLED_SCRAPERS).toBeUndefined();
    expect(nuvioDisabled).not.toContain('sylphera');
    expect(nuvioDisabled).toContain('bdix-cf');
    expect(nuvioDisabled).toContain('bdix-df');
    expect(nuvioDisabled).toContain('bdix-fh');
    expect(nuvioDisabled).toContain('brellor');
    expect(nuvioEnv.SCRAPER_CONCURRENCY).toBe('40');

    const vegaEnv = deriveFleetEnv(appEnv, 'vega', 7003);
    const vegaDisabled = vegaEnv.DISABLED_PROVIDERS.split(',');
    expect(vegaEnv.ENABLED_PROVIDERS).toBeUndefined();
    expect(vegaDisabled).not.toContain('animeworld');
    expect(vegaDisabled).not.toContain('movies4u');
    expect(vegaDisabled).not.toContain('luxMovies');
    expect(vegaDisabled).not.toContain('mod');
    expect(vegaDisabled).not.toContain('1cinevood');
    expect(vegaDisabled).not.toContain('disneyMirror');
    expect(vegaDisabled).not.toContain('netflixMirror');
    expect(vegaDisabled).not.toContain('primeMirror');
    expect(vegaDisabled).not.toContain('mxplayer');
    expect(vegaDisabled).toContain('drive');
    expect(vegaDisabled).toContain('hdhub4u');
    expect(vegaDisabled).toContain('showbox');
    expect(vegaDisabled).not.toContain('extraflix');
    expect(vegaDisabled).not.toContain('aniDream');
    expect(vegaEnv.SEARCH_CONCURRENCY).toBe('40');
  });

  it('applies the Railway profile with Nuvio primary and duplicate fleets disabled', () => {
    const appEnv = loadAppEnv({ INSTANCE_PROFILE: 'railway' });
    expect(Number(appEnv.BACKEND_TIMEOUT_MS)).toBe(34000);
    expect(Number(appEnv.GLOBAL_DEADLINE_MS)).toBe(38000);
    expect(Number(appEnv.SEARCH_CONCURRENCY)).toBe(40);
    expect(Number(appEnv.SEARCH_TIMEOUT_MS)).toBe(15000);

    const sa7Env = deriveFleetEnv(appEnv, 'sa7', 7001);
    const sa7Disabled = sa7Env.DISABLED_PROVIDERS.split(',');
    expect(sa7Disabled).toContain('moviesdrive');
    expect(sa7Disabled).toContain('playimdb');
    expect(sa7Disabled).toContain('vidrock');
    expect(sa7Disabled).toContain('torrentio');
    expect(sa7Disabled).not.toContain('multimovies');
    expect(sa7Disabled).not.toContain('netmirror');
    expect(sa7Disabled).not.toContain('redflix');
    expect(sa7Disabled).not.toContain('desiflix');
    expect(sa7Disabled).not.toContain('kurage');
    expect(Number(sa7Env.PROVIDER_CONCURRENCY)).toBe(40);

    const nuvioEnv = deriveFleetEnv(appEnv, 'nuvio', 7002);
    const nuvioDisabled = nuvioEnv.DISABLED_SCRAPERS.split(',');
    expect(nuvioDisabled).toContain('brellor');
    expect(nuvioDisabled).toContain('bdix-cf');
    expect(nuvioDisabled).toContain('bdix-df');
    expect(nuvioDisabled).toContain('bdix-fh');
    expect(nuvioDisabled).toContain('fastrion');
    expect(nuvioDisabled).toContain('soryn');
    expect(nuvioDisabled).toContain('jyniq');
    expect(nuvioDisabled).not.toContain('sylphera');
    expect(nuvioEnv.ENABLED_SCRAPERS).toBeUndefined();

    const vegaEnv = deriveFleetEnv(appEnv, 'vega', 7003);
    const vegaDisabled = vegaEnv.DISABLED_PROVIDERS.split(',');
    expect(vegaDisabled).toContain('4khdhub');
    expect(vegaDisabled).toContain('anikoto');
    expect(vegaDisabled).toContain('animeworld');
    expect(vegaDisabled).toContain('castle');
    expect(vegaDisabled).toContain('drive');
    expect(vegaDisabled).toContain('hdhub4u');
    expect(vegaDisabled).toContain('katmovies');
    expect(vegaDisabled).toContain('kissKh');
    expect(vegaDisabled).toContain('movieBoxWeb');
    expect(vegaDisabled).toContain('movielinkdb');
    expect(vegaDisabled).toContain('showbox');
    expect(vegaDisabled).toContain('disneyMirror');
    expect(vegaDisabled).toContain('netflixMirror');
    expect(vegaDisabled).toContain('primeMirror');
    expect(vegaDisabled).toContain('multi');
    expect(vegaDisabled).toContain('durbinlive');
    expect(vegaDisabled).toContain('livetgtv');
    expect(vegaDisabled).not.toContain('movies4u');
    expect(vegaDisabled).not.toContain('luxMovies');
    expect(vegaDisabled).not.toContain('1cinevood');
    expect(vegaDisabled).not.toContain('mxplayer');
  });

  it('lets runtime env override profile provider selection without code changes', () => {
    const appEnv = loadAppEnv({
      INSTANCE_PROFILE: 'beamup',
      VEGA_DISABLED_PROVIDERS: 'animeworld',
      NUVIO_DISABLED_SCRAPERS: '*',
    });

    const vegaEnv = deriveFleetEnv(appEnv, 'vega', 7003);
    expect(vegaEnv.DISABLED_PROVIDERS.split(',')).toContain('animeworld');
    expect(vegaEnv.DISABLED_PROVIDERS.split(',')).not.toContain('movies4u');

    const nuvioEnv = deriveFleetEnv(appEnv, 'nuvio', 7002);
    expect(nuvioEnv.DISABLED_SCRAPERS.split(',')).toContain('*');
  });

  it('never re-enables hard-disabled providers through an allowlist', () => {
    const appEnv = loadAppEnv({
      INSTANCE_PROFILE: 'beamup',
      VEGA_ENABLED_PROVIDERS: 'torrentio,animeworld',
      NUVIO_ENABLED_SCRAPERS: 'jyniq',
    });
    const vegaEnv = deriveFleetEnv(appEnv, 'vega', 7003);
    expect(vegaEnv.ENABLED_PROVIDERS).toBe('animeworld');
    expect(vegaEnv.DISABLED_PROVIDERS.split(',')).toContain('torrentio');

    const nuvioEnv = deriveFleetEnv(appEnv, 'nuvio', 7002);
    expect(nuvioEnv.DISABLED_SCRAPERS.split(',')).toContain('jyniq');
  });

  it('verifies baseline policy has sylphera, animeworld, movies4u, and luxMovies disabled by default', () => {
    const defaultEnv = loadAppEnv({});
    const nuvioEnv = deriveFleetEnv(defaultEnv, 'nuvio', 7002);
    const vegaEnv = deriveFleetEnv(defaultEnv, 'vega', 7003);

    expect(nuvioEnv.DISABLED_SCRAPERS.split(',')).toContain('sylphera');
    expect(nuvioEnv.DISABLED_SCRAPERS.split(',')).toContain('fastrion');
    expect(nuvioEnv.DISABLED_SCRAPERS.split(',')).toContain('soryn');
    expect(nuvioEnv.DISABLED_SCRAPERS.split(',')).toContain('jyniq');
    expect(vegaEnv.DISABLED_PROVIDERS.split(',')).toContain('animeworld');
    expect(vegaEnv.DISABLED_PROVIDERS.split(',')).toContain('movies4u');
    expect(vegaEnv.DISABLED_PROVIDERS.split(',')).toContain('luxMovies');
    expect(vegaEnv.DISABLED_PROVIDERS.split(',')).toContain('4khdhub');
    expect(vegaEnv.DISABLED_PROVIDERS.split(',')).toContain('katmovies');
    expect(vegaEnv.DISABLED_PROVIDERS.split(',')).toContain('showbox');
    const sa7Env = deriveFleetEnv(defaultEnv, 'sa7', 7001);
    expect(sa7Env.DISABLED_PROVIDERS.split(',')).toContain('vidrock');
    expect(sa7Env.DISABLED_PROVIDERS.split(',')).not.toContain('netmirror');
    expect(sa7Env.DISABLED_PROVIDERS.split(',')).not.toContain('multimovies');
  });
});
