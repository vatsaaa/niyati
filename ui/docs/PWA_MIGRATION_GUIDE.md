# PWA Migration Guide

## For Developers

### What Changed

The app is now a Progressive Web App with enhanced offline capabilities and installability.

### Breaking Changes

**None!** All changes are backward compatible. The app works exactly as before, with additional PWA features.

### New Dependencies

No new npm packages required! All PWA features use native Web APIs.

### Configuration Updates

#### 1. Service Worker
- Old: Basic caching in `sw.js`
- New: Advanced multi-strategy caching with size limits

#### 2. Manifest
- Old: Basic app info
- New: Full metadata with shortcuts and better icons

#### 3. HTML Meta Tags
- Old: Minimal PWA tags
- New: Complete meta tags for iOS/Android

### Testing Changes

#### Development Mode
```bash
# Service worker only works in production builds
npm run build
npm run preview

# NOT: npm run dev (SW disabled in dev mode)
```

#### New Test Files
```bash
# Run PWA-specific tests
npm run test tests/pwa.spec.js
```

### Debug Tools

New debugging utilities available in dev mode:

```javascript
// Browser console
window.pwaDebug.logPWADiagnostics()
```

### Deployment Considerations

#### HTTPS Required
- PWA features require HTTPS in production
- localhost works for development
- Update your deployment to use HTTPS if not already

#### Service Worker Scope
- Service worker serves from root `/`
- All routes are now cached/served by SW
- API calls go through SW fetch handler

#### Cache Invalidation
When deploying updates:
1. Service worker detects new version
2. Users see update notification
3. They click "Refresh" to get new version
4. Old caches automatically cleaned up

#### CDN Considerations
If using a CDN:
- Set `Cache-Control` headers properly
- Service worker caches locally anyway
- Users get instant loads from local cache

### Monitoring

#### Service Worker Status
Check DevTools → Application → Service Workers

#### Cache Size
Check DevTools → Application → Cache Storage

Limits:
- Static: No limit (app shell)
- Dynamic: 100 entries max
- API: 50 entries max (5 min TTL)
- Images: 60 entries max

#### Performance Metrics

Track these in your analytics:
- Install rate (how many users install)
- Offline usage (navigator.onLine events)
- Cache hit rate (can add telemetry)
- Load times (before/after caching)

---

## For End Users

### What's New

**Install the App:**
- Visit the site 3 times
- See install prompt
- Click "Install"
- App appears on home screen

**Use Offline:**
- No internet? No problem!
- App works offline
- Your profile is always accessible
- Sync happens when back online

**Faster Loading:**
- Instant loads after first visit
- Cached data loads immediately
- New data fetched in background

**Automatic Updates:**
- App updates automatically
- See notification when update ready
- Click "Refresh" to update
- No app store needed!

### Installation Instructions

#### Android (Chrome)
1. Visit Niyati in Chrome
2. Tap menu (⋮) → "Install app"
3. Or wait for install banner
4. Tap "Install"
5. Find app on home screen

#### iOS (Safari)
1. Visit Niyati in Safari
2. Tap Share button (square with arrow)
3. Scroll down, tap "Add to Home Screen"
4. Tap "Add"
5. Find app on home screen

#### Desktop (Chrome/Edge)
1. Visit Niyati
2. Look for install icon in address bar
3. Or Menu → "Install Niyati"
4. Click "Install"
5. App opens in separate window

### Using the App

**Installed App:**
- Opens in full screen (no browser UI)
- Faster startup
- Works offline
- Appears in app switcher
- Can pin to taskbar/dock

**Not Installed:**
- Still works great in browser
- Gets offline support
- Gets faster loads
- Install anytime

### Troubleshooting

**Install Prompt Not Showing?**
- Visit the site 3 times
- Make sure you're on the latest browser
- Already installed? Check home screen!

**App Not Working Offline?**
- Visit site while online first
- Let it cache for a few seconds
- Then go offline and try

**Updates Not Working?**
- Click the "Update Available" notification
- Or close and reopen the app
- Or clear app data and reinstall

**Want to Uninstall?**
- Android: Long-press icon → "Uninstall"
- iOS: Long-press icon → "Remove App"
- Desktop: Right-click icon → "Uninstall"

---

## Rollback Plan

If you need to rollback PWA features:

### 1. Disable Service Worker
```javascript
// In main.jsx, comment out:
// register()
```

### 2. Revert Manifest
```json
// Use minimal manifest
{
  "name": "Niyati",
  "short_name": "Niyati",
  "start_url": "/",
  "display": "browser"
}
```

### 3. Unregister for Users
Add this temporarily:
```javascript
// Unregister old service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(reg => reg.unregister());
  });
}
```

### 4. Clear Caches
```javascript
// Clear old caches
caches.keys().then(keys => {
  keys.forEach(key => caches.delete(key));
});
```

### 5. Redeploy
- Build without PWA components
- Deploy new version
- Old SW unregisters on next visit

---

## FAQ

**Q: Does this change how the app works?**
A: No, all existing functionality remains the same. PWA adds bonus features.

**Q: Will this affect performance?**
A: Actually improves performance! Repeat visits are much faster.

**Q: Do we need new infrastructure?**
A: No, PWA works entirely client-side. No server changes needed.

**Q: What about SEO?**
A: PWA improves SEO! Google prioritizes installable apps.

**Q: What about browser support?**
A: Works on all modern browsers. Degrades gracefully on old browsers.

**Q: What about data usage?**
A: Actually reduces data! Cached assets don't re-download.

**Q: Is this secure?**
A: Yes! Service workers require HTTPS and are sandboxed.

**Q: Can users opt-out?**
A: Yes, they can dismiss install prompt and still use the web version.

**Q: What about storage limits?**
A: Caches have built-in limits. Old entries auto-delete (LRU).

**Q: How do we test this?**
A: Build production version and test in Chrome DevTools. See PWA_QUICK_REFERENCE.md

---

**Questions?** Check the full documentation in `ui/docs/PWA.md`
