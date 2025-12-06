// UI configuration based on environment
// This file exports environment-specific settings for the React app

const ENV = import.meta.env.MODE || 'development';

// Environment-specific configurations
const configs = {
  development: {
    // API endpoints
    bffBaseUrl: import.meta.env.VITE_BFF_BASE_URL || 'http://localhost:3000',
    bffApiVersion: 'v1', // API version
    n8nWebhookUrl: import.meta.env.VITE_N8N_WEBHOOK_URL || 'https://nonexperientially-nonascetical-agnes.ngrok-free.dev/webhook/chat',
    
    // Feature flags
    features: {
      debugMode: import.meta.env.VITE_DEBUG_MODE === 'true' || true,
      mockData: false,
      verboseLogging: true
    },
    
    // Caching
    cache: {
      geocodeTtlDays: 30,
      astrologyTtlDays: 7
    },
    
    // Retry configuration
    retry: {
      maxRetries: 3,
      baseDelayMs: 500
    },
    
    // UI settings
    ui: {
      showVersionInfo: true,
      enableDevTools: true
    }
  },
  
  staging: {
    // API endpoints
    bffBaseUrl: 'https://staging-api.niyati.example.com',
    bffApiVersion: 'v1',
    n8nWebhookUrl: 'https://staging-webhook.niyati.example.com/webhook/chat',
    
    // Feature flags
    features: {
      debugMode: false,
      mockData: false,
      verboseLogging: false
    },
    
    // Caching
    cache: {
      geocodeTtlDays: 30,
      astrologyTtlDays: 7
    },
    
    // Retry configuration
    retry: {
      maxRetries: 3,
      baseDelayMs: 500
    },
    
    // UI settings
    ui: {
      showVersionInfo: true,
      enableDevTools: false
    }
  },
  
  production: {
    // API endpoints - relative URLs in production (same origin)
    bffBaseUrl: '',
    bffApiVersion: 'v1',
    n8nWebhookUrl: 'https://webhook.niyati.example.com/webhook/chat',
    
    // Feature flags
    features: {
      debugMode: false,
      mockData: false,
      verboseLogging: false
    },
    
    // Caching
    cache: {
      geocodeTtlDays: 30,
      astrologyTtlDays: 7
    },
    
    // Retry configuration
    retry: {
      maxRetries: 3,
      baseDelayMs: 500
    },
    
    // UI settings
    ui: {
      showVersionInfo: false,
      enableDevTools: false
    }
  }
};

// Get current environment config
const currentConfig = configs[ENV] || configs.development;

// Export configuration with environment detection
export const config = {
  ...currentConfig,
  
  // Environment info
  env: ENV,
  isDevelopment: ENV === 'development',
  isStaging: ENV === 'staging',
  isProduction: ENV === 'production',
  
  // Version (can be set via build process)
  version: import.meta.env.VITE_APP_VERSION || '0.1.0'
};

// Helper function to get config value with optional override
export function getConfig(path, defaultValue) {
  const parts = path.split('.');
  let value = config;
  
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      return defaultValue;
    }
  }
  
  return value !== undefined ? value : defaultValue;
}

// Helper to build API URL with version
export function buildApiUrl(endpoint) {
  const version = config.bffApiVersion;
  const base = config.bffBaseUrl;
  
  // If endpoint already includes /api/, use as-is (backward compatibility)
  if (endpoint.startsWith('/api/')) {
    return `${base}${endpoint}`;
  }
  
  // Otherwise, add versioned prefix
  return `${base}/api/${version}${endpoint}`;
}

// Export individual configs for convenience
export const BFF_BASE_URL = currentConfig.bffBaseUrl;
export const BFF_API_VERSION = currentConfig.bffApiVersion;
export const N8N_WEBHOOK_URL = currentConfig.n8nWebhookUrl;
export const FEATURES = currentConfig.features;
export const CACHE_CONFIG = currentConfig.cache;
export const RETRY_CONFIG = currentConfig.retry;

export default config;
