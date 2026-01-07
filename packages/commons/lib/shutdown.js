// Simple shutdown registry to track long-lived resources (DB pools, servers)
// and attempt to close them during process shutdown or test teardown.
const logger = (() => {
  try { return require('./logger').logger; } catch (e) { return console; }
})();

// Use a global registry so it survives module reloads (jest.resetModules)
const GLOBAL_REG_KEY = '__NIYATI_SHUTDOWN_REGISTRY__';
if (!global[GLOBAL_REG_KEY]) global[GLOBAL_REG_KEY] = new Set();
const resources = global[GLOBAL_REG_KEY];

function registerShutdown(resource) {
  if (!resource) return;
  resources.add(resource);
}

function unregisterShutdown(resource) {
  if (!resource) return;
  resources.delete(resource);
}

async function shutdownAll(timeoutMs = 15000) {
  const toClose = Array.from(resources);
  if (toClose.length === 0) return;
  logger.info({ msg: 'shutdown_all_resources', count: toClose.length });

  const promises = toClose.map((r) => {
    try {
      // DB pools (pg) expose `end()` returning a Promise
      if (typeof r.end === 'function') return r.end().catch((e) => logger.error({ msg: 'error_closing_resource', err: e && e.message }));
      // HTTP servers expose `close(cb)` where cb is optional
      if (typeof r.close === 'function') {
        return new Promise((resolve) => {
          try {
            r.close(() => resolve());
          } catch (e) {
            logger.error({ msg: 'error_closing_server', err: e && e.message });
            resolve();
          }
        });
      }
      // Some resources (HTTP agents, sockets) expose `destroy()` to forcibly close
      if (typeof r.destroy === 'function') {
        try {
          r.destroy();
        } catch (e) {
          logger.error({ msg: 'error_destroying_resource', err: e && e.message });
        }
        return Promise.resolve();
      }
    } catch (e) {
      logger.error({ msg: 'shutdown_error', err: e && e.message });
    }
    return Promise.resolve();
  });

  // Ensure we don't wait forever. Use an unref'd timeout so Jest/process exit isn't prevented.
  const timeoutPromise = new Promise((resolve) => {
    const t = setTimeout(resolve, timeoutMs);
    if (t && typeof t.unref === 'function') t.unref();
  });
  await Promise.race([
    Promise.all(promises),
    timeoutPromise
  ]).catch((e) => logger.error({ msg: 'shutdown_all_failed', err: e && e.message }));

  // Clear registry after attempting shutdown so subsequent test runs don't retain references
  try { resources.clear(); } catch (e) { logger.warn({ msg: 'failed_clearing_shutdown_registry', err: e && e.message }); }
}

// Attempt graceful shutdown on process events
process.on('beforeExit', () => {
  try { shutdownAll().catch(() => {}); } catch (e) {}
});
process.on('SIGINT', async () => {
  try { await shutdownAll(); } catch (e) {}
  process.exit(0);
});
process.on('SIGTERM', async () => {
  try { await shutdownAll(); } catch (e) {}
  process.exit(0);
});

module.exports = {
  registerShutdown,
  unregisterShutdown,
  shutdownAll
};
