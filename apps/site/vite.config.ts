import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Dev stand-in for the nostube-server `/api/config` (instance config contract v1). Either
 * proxies to a running server (NOSTUBE_SERVER_URL=http://127.0.0.1:8080) or builds a config
 * from NOSTUBE_DEV_CREATOR (64-hex pubkey) and NOSTUBE_DEV_RELAYS (comma-separated wss:// URLs).
 */
function devConfig(env: NodeJS.ProcessEnv): Plugin {
  return {
    name: 'nostube-dev-config',
    configureServer(server) {
      server.middlewares.use('/api/config', async (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (env.NOSTUBE_SERVER_URL) {
          try {
            const upstream = await fetch(new URL('/api/config', env.NOSTUBE_SERVER_URL))
            res.statusCode = upstream.status
            res.end(await upstream.text())
          } catch (error) {
            res.statusCode = 502
            res.end(JSON.stringify({ error: `server unreachable: ${String(error)}` }))
          }
          return
        }
        const creator = env.NOSTUBE_DEV_CREATOR
        const relays = (env.NOSTUBE_DEV_RELAYS ?? '').split(',').filter(Boolean)
        if (!creator || relays.length === 0) {
          res.statusCode = 503
          res.end(
            JSON.stringify({
              error: 'Set NOSTUBE_SERVER_URL, or NOSTUBE_DEV_CREATOR and NOSTUBE_DEV_RELAYS.',
            })
          )
          return
        }
        res.end(
          JSON.stringify({
            version: 1,
            revision: 1,
            origin: 'https://site.example',
            title: 'Nostube Site (dev)',
            creators: [creator],
            startPage: { kind: 'creator-profile', creator },
            videoSources: relays,
            interactionRelays: relays,
            search: { mode: 'off' },
          })
        )
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devConfig(process.env)],
})
