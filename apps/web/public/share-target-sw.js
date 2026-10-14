// Web Share Target (manifest.webmanifest `share_target`), loaded into the generated
// service worker via workbox `importScripts`. Android posts a shared video here; we stash
// it in the Cache API and send the app to the upload page, which takes it from there
// (src/lib/shared-file.ts, keep the cache name and key in sync).
self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/share-target') return

  event.respondWith(
    (async () => {
      const file = (await request.formData()).get('video')
      if (file instanceof File && file.type.startsWith('video/')) {
        const cache = await caches.open('nostube-shared-file')
        await cache.put(
          '/shared-file',
          new Response(file, {
            headers: {
              'Content-Type': file.type,
              'X-File-Name': encodeURIComponent(file.name),
            },
          })
        )
        return Response.redirect('/upload?shared=1', 303)
      }
      return Response.redirect('/upload', 303)
    })()
  )
})
