import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { register } from './utils/registerSW'
import startBffPthruDiscovery from './utils/bffPthruDiscovery';

// Load PWA debug utilities in development
if (import.meta.env.DEV) {
  import('./utils/pwaDebug');
}

// Start bff-pthru discovery polling (sets window.__USE_BFF_PTHRU)
startBffPthruDiscovery();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register service worker with update handling
register()
