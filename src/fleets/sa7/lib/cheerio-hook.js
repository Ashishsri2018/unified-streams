'use strict';

const Module = require('node:module');

if (!Module._cheerioHooked) {
  Module._cheerioHooked = true;
  const origResolve = Module._resolveFilename;
  let cheerioPath = null;

  try {
    cheerioPath = require.resolve('cheerio', { paths: [__dirname, process.cwd()] });
  } catch {
    cheerioPath = null;
  }

  Module._resolveFilename = function (request, parent, isMain, options) {
    if (cheerioPath && (request === 'cheerio' || request === 'cheerio-without-node-native')) {
      return cheerioPath;
    }
    return origResolve.call(this, request, parent, isMain, options);
  };
}

module.exports = {};
