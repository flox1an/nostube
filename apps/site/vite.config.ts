import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Dev stand-in for the nostube-server `/api/config` (instance config contract v1). Either
 * proxies to a running server (NOSTUBE_SERVER_URL=http://127.0.0.1:8080) or builds a config
 * from NOSTUBE_DEV_CREATOR (64-hex pubkey) and NOSTUBE_DEV_RELAYS (comma-separated wss:// URLs);
 * NOSTUBE_DEV_SEARCH=local turns the search on.
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
            search: { mode: env.NOSTUBE_DEV_SEARCH === 'local' ? 'local' : 'off' },
            site: {
              tagline: '',
              theme: { accent: '#8b5cf6', font: 'sans' },
              videos: { hidden: [] },
              links: {
                profile: 'https://njump.me/{nip19}',
                video: 'https://nostu.be/v/{nip19}',
                note: 'https://njump.me/{nip19}',
              },
            },
          })
        )
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    devConfig(process.env),
    // sw.js is served by nostube-server from the root with `Cache-Control: no-cache`.
    VitePWA({
      registerType: 'autoUpdate',
      // The server serves /manifest.webmanifest (per instance) and injects the head tags.
      manifest: false,
      injectRegister: 'auto',
      workbox: {
        // Hashed build output and the fallback icons. Never index.html: the server injects the
        // instance config (#nostube-config) and the SEO head into every shell it serves; a build
        // shell would boot without config.
        globPatterns: ['**/*.{js,css,html,png,svg,webp,ico,woff,woff2}'],
        globIgnores: ['index.html'],
        // ponytail: the site is one ~2.4 MB entry chunk and it is the offline shell; split it
        // (manualChunks) if it keeps growing instead of raising this further.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // The plugin defaults to index.html; served shells come from the network (below).
        navigateFallback: null,
        runtimeCaching: [
          {
            // Pages only: navigations to the site's routes (src/SiteHome.tsx; the pages are
            // SITE_PAGES). Everything else on the origin (relay WebSocket, Blossom blobs and
            // their range requests, /api, /admin, /studio, /branding, /.well-known, /embed.html,
            // feeds, sitemap, robots, /manifest.webmanifest) never touches the worker. The served
            // shell is fresh when online, the last one offline. Inline regex: workbox copies
            // this function into sw.js as source, outer variables do not come along.
            urlPattern: ({ request, sameOrigin, url }) =>
              request.mode === 'navigate' &&
              sameOrigin &&
              /^\/(?:$|v\/|t\/|search$|about$|imprint$|privacy$)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'site-pages',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 50, purgeOnQuotaError: true },
              plugins: [
                {
                  // Only a real page: no error page, redirect or non-HTML answer.
                  cacheWillUpdate: async ({ response }) =>
                    response.status === 200 &&
                    response.headers.get('Content-Type')?.includes('text/html')
                      ? response
                      : null,
                },
              ],
            },
          },
        ],
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
})
