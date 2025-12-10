import { BFF_BASE_URL } from '../config';

// Default poll interval (ms) — 300s
const DEFAULT_POLL_INTERVAL = parseInt(import.meta.env.VITE_BFF_PTHRU_POLL_INTERVAL_MS || '300000', 10);
const HEALTH_PATH = '/health';
const STORAGE_KEY = 'bffPthru.discovery';

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (!v) return null;
    return JSON.parse(v);
  } catch (e) {
    return null;
  }
}

function writeStored(obj) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch (e) {}
}

export function startBffPthruDiscovery({ intervalMs = DEFAULT_POLL_INTERVAL, baseUrl = import.meta.env.VITE_BFF_PTHRU_URL || 'http://localhost:3003' } = {}) {
  // Initialize flag from storage
  const stored = readStored();
  if (stored && typeof stored.use === 'boolean') {
    window.__USE_BFF_PTHRU = stored.use;
  }

  async function check() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${baseUrl}${HEALTH_PATH}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) {
        window.__USE_BFF_PTHRU = false;
        writeStored({ use: false, ts: Date.now() });
        return;
      }
      const json = await res.json();
      const use = Boolean(json && json.supportsChat && json.n8nConfigured);
      window.__USE_BFF_PTHRU = use;
      writeStored({ use, ts: Date.now() });
    } catch (err) {
      window.__USE_BFF_PTHRU = false;
      writeStored({ use: false, ts: Date.now() });
    }
  }

  // initial check
  check();
  const id = setInterval(check, intervalMs);
  return () => clearInterval(id);
}

export default startBffPthruDiscovery;
