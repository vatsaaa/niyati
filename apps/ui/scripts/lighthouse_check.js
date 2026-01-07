#!/usr/bin/env node
/*
Run Lighthouse against a local host and exit non-zero if PWA installability audit fails.
Usage: 
  1. Build the production bundle: npm run build
  2. Start the preview server: npm run preview (in a separate terminal)
  3. Run this script: npm run pwa:check
  
This script requires `lighthouse` and `chrome-launcher`.
*/

import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { writeFileSync } from 'fs';
import http from 'http';

const defaultUrl = process.env.PWA_URL || 'http://localhost:4173';
const alternatePorts = [4173, 4174, 4175];

// Check if server is running
async function checkServer(url) {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      method: 'GET',
      timeout: 2000
    };
    
    const req = http.request(options, (res) => {
      resolve(true);
    });
    
    req.on('error', () => {
      resolve(false);
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

async function findRunningServer() {
  console.log('Checking for preview server...');
  
  for (const port of alternatePorts) {
    const url = `http://localhost:${port}/`;
    const isRunning = await checkServer(url);
    if (isRunning) {
      console.log(`✓ Found server at ${url}\n`);
      return url;
    }
  }
  
  return null;
}

async function runLighthouse() {
  // Find running preview server
  const url = await findRunningServer();
  
  if (!url) {
    console.error('\n❌ Preview server is not running');
    console.error('\nChecked ports:', alternatePorts.join(', '));
    console.error('\nPlease start the server first:');
    console.error('  npm run preview');
    console.error('\nOr use the automated script:');
    console.error('  npm run pwa:check:auto');
    process.exit(1);
  }

  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless', '--no-sandbox'] });
  try {
    const options = {
      logLevel: 'info',
      output: 'json',
      onlyCategories: ['pwa'],
      port: chrome.port,
    };

    const runnerResult = await lighthouse(url, options);
    const reportJson = runnerResult.lhr;
    const pwaScore = reportJson.categories.pwa.score * 100;

    console.log('\nLighthouse PWA score:', pwaScore);

    // Check for specific important audits
    const audits = reportJson.audits;
    const installable = audits['installable-manifest'] && audits['installable-manifest'].score >= 1;
    const serviceWorker = audits['service-worker'] && audits['service-worker'].score >= 1;

    if (!installable) {
      console.error('PWA check failed: installable-manifest audit did not pass');
    }
    if (!serviceWorker) {
      console.error('PWA check failed: service-worker audit did not pass');
    }

    // Save report to disk for debugging
    writeFileSync('lighthouse-pwa-report.json', JSON.stringify(reportJson, null, 2));

    const ok = installable && serviceWorker;
    if (!ok) process.exitCode = 2;
  } catch (err) {
    console.error('Lighthouse run failed:', err && err.message ? err.message : err);
    console.error('\nMake sure:');
    console.error('1. You have built the app: npm run build');
    console.error('2. The preview server is running: npm run preview');
    console.error('3. The server is accessible at:', url);
    process.exitCode = 3;
  } finally {
    await chrome.kill();
  }
}

runLighthouse();
