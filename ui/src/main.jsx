import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { register } from './utils/registerSW'

// Load PWA debug utilities in development
if (import.meta.env.DEV) {
  import('./utils/pwaDebug');
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register service worker with update handling
register()
