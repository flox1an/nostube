import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The server serves the studio under /studio/. In development, NOSTUBE_SERVER_URL
// (https://localhost:8443, say) forwards the admin API and the login to a running server.
const server = process.env.NOSTUBE_SERVER_URL
const proxied = { target: server, changeOrigin: true, secure: false }

export default defineConfig({
  base: '/studio/',
  plugins: [react(), tailwindcss()],
  server: server
    ? {
        proxy: {
          '/api': proxied,
          '/admin': proxied,
          '/upload': proxied,
          '/ca.pem': proxied,
          '/studio/ca.pem': proxied,
        },
      }
    : undefined,
})
