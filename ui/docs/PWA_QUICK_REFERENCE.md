# PWA Quick Reference

## Testing PWA Features

### Build & Serve Production
```bash
cd ui
npm run build
npm run preview
```

### Run PWA Tests
```bash
npm run test tests/pwa.spec.js
```

### Lighthouse PWA Audit
```bash
npm run pwa:check
```

## Development Console Commands

When running in dev mode, these utilities are available at `window.pwaDebug`:

### Service Worker Status
```javascript
await window.pwaDebug.getServiceWorkerStatus()
// Returns: { supported, registered, active, waiting, scope }
```

### Cache Inspection
```javascript
await window.pwaDebug.getCacheStatus()
// Returns: { caches: [...], totalCaches }
```

### Check Installation
```javascript
window.pwaDebug.isAppInstalled()
// Returns: { installed, displayMode, platform }
```

### Network Info
```javascript
window.pwaDebug.getNetworkInfo()
// Returns: { online, type, downlink, rtt, saveData }
```

### Full Diagnostics
```javascript
await window.pwaDebug.logPWADiagnostics()
// Logs comprehensive PWA status to console
```

### Clear Everything
```javascript
// Clear all caches
await window.pwaDebug.clearAllCaches()

// Unregister service workers
await window.pwaDebug.unregisterAllServiceWorkers()

// Then reload
location.reload()
```

### Force Update
```javascript
await window.pwaDebug.forceServiceWorkerUpdate()
```

## Chrome DevTools

### Service Worker Panel
1. Open DevTools (F12)
2. Application tab → Service Workers
3. View: Status, Scope, Source
4. Actions: Update, Unregister, Skip waiting

### Cache Storage Panel
1. Open DevTools (F12)
2. Application tab → Cache Storage
3. View all caches and their contents
4. Right-click to delete entries or entire caches

### Manifest Panel
1. Open DevTools (F12)
2. Application tab → Manifest
3. View: App info, Icons, Protocol handlers
4. Test: "Add to homescreen" button

### Lighthouse Panel
1. Open DevTools (F12)
2. Lighthouse tab
3. Select: Progressive Web App
4. Click: Generate report
5. Target: 100/100 PWA score

## Testing Offline Behavior

### Method 1: DevTools Network Panel
1. Open DevTools (F12)
2. Network tab
3. Check "Offline" checkbox
4. Reload page

### Method 2: DevTools Application Panel
1. Open DevTools (F12)
2. Application tab → Service Workers
3. Check "Offline" checkbox

### Method 3: OS Network Settings
- Disconnect Wi-Fi or unplug ethernet
- Or enable Airplane mode

## Install Testing

### Desktop (Chrome/Edge)
1. Visit site over HTTPS
2. Look for install icon in address bar
3. Or: Menu → Install [App Name]
4. App opens in standalone window

### Android
1. Visit site in Chrome
2. Tap menu (⋮) → Install app
3. Or: Banner prompt appears
4. App appears on home screen

### iOS Safari
1. Visit site in Safari
2. Tap Share button
3. Scroll and tap "Add to Home Screen"
4. App appears on home screen

## Update Testing

### Simulate Update
1. Make code changes
2. Build new version: `npm run build`
3. Deploy or serve new build
4. Existing users see update notification
5. Click "Refresh" to update

### Force Update in DevTools
1. Application → Service Workers
2. Check "Update on reload"
3. Reload page
4. New SW activates immediately

## Common Issues

### Install Prompt Not Showing
- Check: Served over HTTPS
- Check: Manifest is valid
- Check: Service worker registered
- Check: Not already installed
- Check: Visit count >= 3
- Clear: `localStorage.removeItem('niyati_installPromptDismissed')`

### Service Worker Not Updating
- Solution 1: Hard refresh (Ctrl+Shift+R)
- Solution 2: DevTools → Application → Service Workers → Unregister
- Solution 3: Check "Update on reload" in DevTools
- Solution 4: `await window.pwaDebug.forceServiceWorkerUpdate()`

### Cache Not Working
- Check: Service worker is active
- Check: Cache names in Application → Cache Storage
- Verify: `await window.pwaDebug.getCacheStatus()`
- Test: `await window.pwaDebug.testCache()`

### Offline Page Not Loading
- Verify: `/offline.html` exists
- Check: Precached in service worker install event
- Test: Go offline and visit new page
- Debug: Check Network tab for failed requests

## Performance Targets

### Lighthouse Scores
- Performance: 90+
- PWA: 100
- Accessibility: 90+
- Best Practices: 95+
- SEO: 90+

### Load Times
- First Visit: < 3s
- Repeat Visit: < 1s
- Offline: < 500ms

### Cache Hit Rates
- Static Assets: 95%+
- API Responses: 60%+
- Images: 80%+

## File Checklist

- [x] `/public/manifest.json` - App manifest
- [x] `/public/sw.js` - Service worker
- [x] `/public/offline.html` - Offline page
- [x] `/public/icons/*` - App icons
- [x] `/src/utils/registerSW.js` - SW registration
- [x] `/src/components/InstallPrompt.jsx` - Install UI
- [x] `/src/components/UpdateNotification.jsx` - Update UI
- [x] `/src/components/NetworkStatus.jsx` - Offline indicator
- [x] `/src/hooks/usePWA.js` - PWA hooks
- [x] `/src/utils/pwaDebug.js` - Debug utilities
- [x] `index.html` - Meta tags
- [x] `vite.config.js` - Build config

## Resources

- [PWA Checklist](https://web.dev/pwa-checklist/)
- [Service Worker Cookbook](https://serviceworke.rs/)
- [Workbox Documentation](https://developers.google.com/web/tools/workbox)
- [Can I Use: Service Workers](https://caniuse.com/serviceworkers)
- [PWA Builder](https://www.pwabuilder.com/)

---

**Quick Start**: Build, serve, test offline, install, verify cache → Done! ✅
