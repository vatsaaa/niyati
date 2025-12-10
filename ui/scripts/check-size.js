#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const DIST = path.resolve(__dirname, '..', 'dist')
const ASSETS = path.join(DIST, 'assets')

if (!fs.existsSync(DIST)) {
  console.error('dist directory not found. Run `npm run build` first.')
  process.exit(2)
}

function gzipSize(buf) {
  return zlib.gzipSync(buf).length
}

function human(n) {
  if (n > 1024 * 1024) return (n / (1024 * 1024)).toFixed(2) + ' MB'
  if (n > 1024) return (n / 1024).toFixed(2) + ' KB'
  return n + ' B'
}

const files = []

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = fs.statSync(full)
    if (st.isDirectory()) walk(full)
    else files.push(full)
  }
}

walk(DIST)

const jsFiles = files.filter(f => f.endsWith('.js') || f.endsWith('.css') || f.endsWith('.html'))

const results = jsFiles.map(f => {
  const buf = fs.readFileSync(f)
  const gz = gzipSize(buf)
  return { file: path.relative(DIST, f), bytes: buf.length, gzip: gz }
})

results.sort((a, b) => b.gzip - a.gzip)

console.log('\nBundle gzip size report (sorted):')
console.log('--------------------------------')
results.forEach(r => {
  console.log(`${r.file.padEnd(40)}  ${human(r.gzip).padStart(8)} (gz)  ${human(r.bytes).padStart(8)} (raw)`)
})

// thresholds (tunable)
const PER_FILE_LIMIT = process.env.PER_FILE_LIMIT ? parseInt(process.env.PER_FILE_LIMIT, 10) : 200 * 1024
const TOTAL_JS_LIMIT = process.env.TOTAL_JS_LIMIT ? parseInt(process.env.TOTAL_JS_LIMIT, 10) : 350 * 1024

const totalJsGzip = results.filter(r => r.file.endsWith('.js')).reduce((s, r) => s + r.gzip, 0)

console.log('\nThresholds:')
console.log(`  per-file gzip limit: ${human(PER_FILE_LIMIT)}`)
console.log(`  total js gzip limit: ${human(TOTAL_JS_LIMIT)}`)
console.log(`  total js gzip (current): ${human(totalJsGzip)}`)

let failed = false
for (const r of results) {
  if (r.gzip > PER_FILE_LIMIT) {
    console.error(`\nERROR: file exceeds per-file limit: ${r.file} => ${human(r.gzip)}`)
    failed = true
  }
}
if (totalJsGzip > TOTAL_JS_LIMIT) {
  console.error(`\nERROR: total JS gzip ${human(totalJsGzip)} exceeds limit ${human(TOTAL_JS_LIMIT)}`)
  failed = true
}

if (failed) process.exit(1)
console.log('\nOK: bundle size limits are within thresholds')
