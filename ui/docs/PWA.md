# Progressive Web App (PWA) Implementation

## Overview

Niyati is now a fully-featured Progressive Web App with offline support, installability, and automatic updates.

## Features Implemented

### ✅ Core PWA Features

1. **Web App Manifest** (`/public/manifest.json`)
   - App name, description, and icons
   - Standalone display mode
   - Theme colors for branded experience
   - Shortcuts for quick actions

2. **Service Worker** (`/public/sw.js`)
   - Advanced caching strategies
   - Offline support
   - Network-first for navigation
   - Cache-first for static assets
   - API response caching with timeout
   - Automatic cache size management

3. **Offline Support**
   - Custom offline page (`/public/offline.html`)
   - Cached profile data available offline
   - Network status indicator
   - Automatic reconnection detection

4. **Install Prompt** (`/components/InstallPrompt.jsx`)
   - Smart install prompt (shows after 3+ visits)
   - User-friendly install dialog
   - Dismissible with "remind later" option
   - Tracks installation status

5. **Update Notifications** (`/components/UpdateNotification.jsx`)
   - Automatic update detection
   - User-friendly update prompt
   - Seamless refresh on update

6. **Network Status** (`/components/NetworkStatus.jsx`)
   - Offline indicator banner
   - Real-time connection monitoring

### 🎯 Caching Strategy

#### Static Assets (Cache-First)
- HTML pages
- CSS stylesheets
- JavaScript bundles
- Images and icons
- Fonts

#### API Requests (Network-First with Timeout)
- Geocoding API
- Astrology API
- 10-second timeout with cache fallback
- Excludes telemetry from caching

#### Navigation (Network-First)
- HTML pages fetch from network
- Falls back to cache when offline
- Offline page as ultimate fallback

### 📦 Cache Management

- **Static Cache**: App shell and essential files
- **Dynamic Cache**: Navigation and runtime assets (max 100 items)
- **API Cache**: API responses (max 50 items, 5 min TTL)
- **Image Cache**: Downloaded images (max 60 items)
- Automatic LRU eviction when limits reached

## User Experience

### Installation Flow

1. User visits the site 3+ times
2. Install prompt appears (if not previously dismissed)
3. User clicks "Install" → App added to home screen
4. Launches in standalone mode (no browser chrome)

### Offline Experience

1. User loses internet connection
2. Yellow banner appears: "You're offline"
3. Cached content remains accessible
4. API calls fall back to cached responses
5. When connection returns, banner disappears and app resumes

### Update Flow

1. New version deployed
2. Service worker detects update
3. Blue notification appears: "Update Available"
4. User clicks "Refresh" → Seamless update
5. App reloads with new version

## Testing

### Local Testing

```bash
# Build for production (PWA only works in production mode)
npm run build

# Serve the production build
npm run preview

# Test in Chrome DevTools
# 1. Open DevTools → Application tab
# 2. Check "Service Workers" section
# 3. Check "Manifest" section
# 4. Use "Lighthouse" for PWA audit
```

### PWA Audit

Run Lighthouse audit to verify PWA compliance:

```bash
npm run pwa:check
```

Target scores:
- Performance: 90+
- Progressive Web App: 100
- Accessibility: 90+
- Best Practices: 95+
- SEO: 90+

### Manual Testing Checklist

- [ ] App can be installed on mobile (Android/iOS)
- [ ] App can be installed on desktop (Chrome/Edge)
- [ ] Offline page displays when network is unavailable
- [ ] Cached content works offline
- [ ] Install prompt shows after 3 visits
- [ ] Update notification appears on new deployment
- [ ] Network status banner appears when offline
- [ ] Service worker activates and caches assets
- [ ] App works in standalone mode

## Browser Support

### Full Support
- ✅ Chrome/Edge 90+
- ✅ Safari 15.4+ (iOS/macOS)
- ✅ Firefox 90+
- ✅ Samsung Internet 14+

### Partial Support
- ⚠️ Safari 11.1-15.3 (limited install prompt)
- ⚠️ Firefox Android (limited install features)

### Not Supported
- ❌ Internet Explorer
- ❌ Opera Mini

## File Structure

```
ui/
├── public/
│   ├── manifest.json          # PWA manifest
│   ├── sw.js                   # Service worker
│   ├── offline.html            # Offline fallback page
│   └── icons/
│       ├── icon-192.svg
│       └── icon-512.svg
├── src/
│   ├── components/
│   │   ├── InstallPrompt.jsx
│   │   ├── UpdateNotification.jsx
│   │   └── NetworkStatus.jsx
│   ├── hooks/
│   │   └── usePWA.js           # PWA-related hooks
│   └── utils/
│       └── registerSW.js       # Service worker registration
```

## Configuration

### Manifest Customization

Edit `/public/manifest.json`:

```json
{
  "name": "Your App Name",
  "short_name": "Short Name",
  "theme_color": "#2563eb",
  "background_color": "#ffffff"
}
```

### Service Worker Cache Tuning

Edit `/public/sw.js`:

```javascript
const MAX_API_CACHE_SIZE = 50;    // API response cache limit
const MAX_IMAGE_CACHE_SIZE = 60;  // Image cache limit
const MAX_DYNAMIC_CACHE_SIZE = 100; // Dynamic content limit
```

### Install Prompt Timing

Edit `/src/components/InstallPrompt.jsx`:

```javascript
if (visitCount >= 3 && !dismissed && !installed) {
  // Change '3' to desired number of visits
  setTimeout(() => setShowPrompt(true), 3000);
  // Change '3000' to desired delay in milliseconds
}
```

## Debugging

### Service Worker

```javascript
// In browser console
navigator.serviceWorker.getRegistrations().then(registrations => {
  console.log('Active service workers:', registrations);
});

// Force update
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations[0].update();
});

// Unregister (for debugging)
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations[0].unregister();
});
```

### Cache Inspection

Open Chrome DevTools → Application → Cache Storage

View cached responses:
- `niyati-static-v1.0.0` - Static assets
- `niyati-dynamic-v1.0.0` - Runtime content
- `niyati-api-v1.0.0` - API responses
- `niyati-images-v1.0.0` - Images

### Clear All PWA Data

```javascript
// Run in console to reset PWA state
caches.keys().then(keys => {
  keys.forEach(key => caches.delete(key));
});
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(r => r.unregister());
});
localStorage.clear();
location.reload();
```

## Performance Metrics

### Cache Hit Rates (Target)
- Static assets: 95%+
- API responses: 60%+
- Images: 80%+

### Load Times (Target)
- First visit: < 3s
- Repeat visit: < 1s
- Offline load: < 500ms

## Security Considerations

1. **HTTPS Required**: PWA features only work over HTTPS (or localhost)
2. **Service Worker Scope**: Limited to same origin
3. **Cache Poisoning Prevention**: Validates response status before caching
4. **No Sensitive Data in Cache**: API keys and tokens excluded

## Future Enhancements

- [ ] Background sync for queued actions
- [ ] Push notifications for daily horoscopes
- [ ] Periodic background sync for data updates
- [ ] Share target API integration
- [ ] Advanced home screen shortcuts
- [ ] Badging API for unread notifications

## Resources

- [MDN: Progressive Web Apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [web.dev: PWA](https://web.dev/progressive-web-apps/)
- [PWA Builder](https://www.pwabuilder.com/)
- [Workbox Documentation](https://developers.google.com/web/tools/workbox)

## Troubleshooting

### Install Prompt Not Showing

- Ensure app is served over HTTPS
- Check browser console for errors
- Verify manifest.json is valid
- Service worker must be registered
- User must not have dismissed permanently

### Service Worker Not Updating

- Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
- Unregister old worker in DevTools
- Clear cache and reload
- Check for errors in console

### Offline Page Not Loading

- Verify `/offline.html` is cached in install event
- Check service worker fetch handler
- Ensure CACHE_STATIC includes offline.html

---

**Built with ❤️ for Niyati**
