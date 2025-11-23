import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      "niyati-chat.loca.lt", // The URL from "npx localtunnel --port 5173"
      "localhost"
    ]
  }
})