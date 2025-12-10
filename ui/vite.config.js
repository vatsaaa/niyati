import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    visualizer({ filename: 'bundle-stats.html', open: false })
  ],
  server: {
    allowedHosts: [
      "niyati-chat.loca.lt", // The URL from "npx localtunnel --port 5173"
      "localhost"
    ]
  },
  build: {
    // Emit source maps only when we have Sentry credentials in CI
    sourcemap: !!process.env.SENTRY_AUTH_TOKEN,
    target: 'es2018',
    minify: 'esbuild',
    esbuild: {
      drop: ['console', 'debugger']
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor'
        }
      }
    }
  }
})