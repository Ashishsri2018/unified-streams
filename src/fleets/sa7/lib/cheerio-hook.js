'use strict';

const Module = require('node:module');

if (!Module._providerModuleHooked) {
  Module._providerModuleHooked = true;
  const origResolve = Module._resolveFilename;

  // SA7 providers run from DATA_DIR (e.g. /data/sa7/cb-providers), which is
  // often outside the app tree, so Node cannot resolve their bare requires by
  // walking up from the provider file. Redirect known dependencies to the
  // copies installed alongside the app.
  function resolveFromApp(request) {
    try {
      return require.resolve(request, { paths: [__dirname, process.cwd()] });
    } catch {
      return null;
    }
  }

  const aliases = new Map();
  const cheerioPath = resolveFromApp('cheerio');
  if (cheerioPath) {
    aliases.set('cheerio', cheerioPath);
    aliases.set('cheerio-without-node-native', cheerioPath);
  }
  const cryptoJsPath = resolveFromApp('crypto-js');
  if (cryptoJsPath) aliases.set('crypto-js', cryptoJsPath);

  Module._resolveFilename = function (request, parent, isMain, options) {
    const alias = aliases.get(request);
    if (alias) return alias;
    return origResolve.call(this, request, parent, isMain, options);
  };

  // Several providers (moviebox, castle, ...) read CryptoJS from the global
  // instead of requiring it. Expose the app copy so they no longer fail with
  // "Cannot read properties of undefined (reading 'Base64')".
  if (cryptoJsPath) {
    try {
      global.CryptoJS = require(cryptoJsPath);
    } catch {
      // Providers that require crypto-js still work through the alias above.
    }
  }
}

module.exports = {};
