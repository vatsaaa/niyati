const fs = require('fs');
const path = require('path');

function listTestFiles(dir) {
  const files = [];
  function walk(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.test\.js$/.test(e.name)) files.push(full);
    }
  }
  walk(dir);
  return files;
}

function normalize(s) {
  return s
    .replace(/\/\*[^*]*\*+([^/*][^*]*\*+)*\//g, ' ') // remove block comments
    .replace(/\/\/.*$/mg, ' ') // remove line comments
    .replace(/\s+/g, ' ')
    .replace(/["'`]/g, '')
    .toLowerCase()
    .trim();
}

function jaccard(a, b) {
  const A = new Set(a.split(/\s+/));
  const B = new Set(b.split(/\s+/));
  const inter = new Set([...A].filter(x => B.has(x)));
  const uni = new Set([...A, ...B]);
  if (uni.size === 0) return 0;
  return inter.size / uni.size;
}

function main() {
  const root = path.resolve(__dirname, '..');
  const testDirs = [
    path.join(root, 'apps', 'bff-platform', 'test'),
    path.join(root, 'apps', 'bff-auth', 'test'),
    path.join(root, 'packages', 'commons', 'test'),
    path.join(root, 'apps', 'worker', 'test')
  ];

  const files = testDirs
    .filter(d => fs.existsSync(d))
    .flatMap(d => listTestFiles(d));

  const contents = files.map(f => ({ f, txt: normalize(fs.readFileSync(f, 'utf8')) }));

  const threshold = 0.8;
  const pairs = [];
  for (let i = 0; i < contents.length; i++) {
    for (let j = i + 1; j < contents.length; j++) {
      const sim = jaccard(contents[i].txt, contents[j].txt);
      if (sim >= threshold) pairs.push({ a: contents[i].f, b: contents[j].f, sim });
    }
  }

  if (pairs.length === 0) {
    console.log('No high-similarity test pairs found (threshold=' + threshold + ').');
    return;
  }

  console.log('High-similarity test pairs:');
  for (const p of pairs) console.log(`${p.sim.toFixed(3)}  ${p.a}  <-->  ${p.b}`);
}

main();
