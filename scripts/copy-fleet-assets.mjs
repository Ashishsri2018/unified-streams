import fs from 'node:fs';

function copyDir(src, dest) {
  if (fs.existsSync(src)) {
    fs.mkdirSync(dest, { recursive: true });
    fs.cpSync(src, dest, { recursive: true });
  }
}

copyDir('src/fleets/sa7', 'dist/fleets/sa7');
copyDir('src/fleets/nuvio/snapshot', 'dist/fleets/nuvio/snapshot');
copyDir('src/fleets/vega/providers-baseline', 'dist/fleets/vega/providers-baseline');
