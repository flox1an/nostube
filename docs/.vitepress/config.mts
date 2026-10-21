import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Nostube',
  // Served from https://flox1an.github.io/nostube/ (GitHub Pages project site).
  base: '/nostube/',
  description: 'Video on Nostr: the web app, the self-hosted server and the embed player',
  cleanUrls: true,
  lastUpdated: true,
  // Engineering notes (agent tooling, ADRs, open specs and plans) and git-ignored private notes,
  // not user documentation.
  srcExclude: [
    'agents/**',
    'adr/**',
    'specs/**',
    'plans/**',
    'competitor-analysis/**',
    'README.md',
  ],
  head: [['link', { rel: 'icon', type: 'image/png', href: '/nostube/favicon.png' }]],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'Nostube Server', link: '/server/' },
      { text: 'Web app', link: '/web-app/' },
      { text: 'Embed', link: '/embed/' },
      { text: 'Developers', link: '/developers/' },
      { text: 'nostu.be', link: 'https://nostu.be' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'What is Nostube?', link: '/guide/' },
          { text: 'Tour', link: '/guide/tour' },
          { text: 'Self-hosting options', link: '/guide/self-hosting' },
        ],
      },
      {
        text: 'Nostube Server',
        items: [
          { text: 'Getting started', link: '/server/' },
          { text: 'Configuration', link: '/server/configuration' },
          { text: 'HTTPS and networks', link: '/server/tls' },
          { text: 'Studio', link: '/server/studio' },
          { text: 'Storage and S3', link: '/server/storage' },
          { text: 'Operations', link: '/server/operations' },
        ],
      },
      { text: 'Web app', items: [{ text: 'Self-hosting the web app', link: '/web-app/' }] },
      {
        text: 'Embedded player',
        items: [{ text: 'Nostube Embedded Player', link: '/embed/' }],
      },
      {
        text: 'oEmbed',
        items: [{ text: 'oEmbed endpoint', link: '/embed/oembed' }],
      },
      {
        text: 'Media',
        items: [
          { text: 'Blossom storage', link: '/media/blossom' },
          { text: 'Uploads and transcoding', link: '/media/uploads' },
        ],
      },
      {
        text: 'Developers',
        items: [
          { text: 'Development setup', link: '/developers/' },
          { text: 'Architecture decisions', link: '/developers/architecture' },
          { text: 'NIP-71 video events', link: '/developers/nip-71' },
          { text: 'Transform DVM API', link: '/developers/dvm-api' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/flox1an/nostube' }],
    editLink: { pattern: 'https://github.com/flox1an/nostube/edit/main/docs/:path' },
    search: { provider: 'local' },
    footer: { message: 'Released under the MIT License.' },
  },
})
