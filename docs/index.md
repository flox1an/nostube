---
layout: home

hero:
  name: Nostube
  text: Video on Nostr
  tagline: Watch and publish videos on Nostr with nostu.be, or run your own channel with Nostube Server — homepage, Studio, relay and Blossom storage in one package.
  image:
    src: /logo.svg
    alt: Nostube
  actions:
    - theme: brand
      text: Run Nostube Server
      link: /server/
    - theme: alt
      text: What is Nostube?
      link: /guide/
    - theme: alt
      text: Embed a video
      link: /embed/
    - theme: alt
      text: GitHub
      link: https://github.com/flox1an/nostube

features:
  - icon: 🏠
    title: Nostube Server
    details: Your own video homepage with Studio, a Nostr relay and Blossom storage in one container. Works on a home network, with optional S3 storage, mirrors and public reach.
    link: /server/
  - icon: 📺
    title: Web app
    details: The nostu.be video client — feeds, shorts, playlists, comments and zaps from any Nostr relay. Host your own copy as a static site or Docker image.
    link: /web-app/
  - icon: 🧩
    title: Embed player
    details: Put any Nostr video on a website with an iframe or oEmbed link previews.
    link: /embed/
  - icon: 🌸
    title: Blossom storage
    details: Videos are content-addressed blobs on Blossom servers. Use public servers, Nostube Server's built-in storage, or Almond.
    link: /media/blossom
  - icon: ⚙️
    title: Browser transcoding
    details: Uploads are converted to web-friendly formats in the browser before upload — no transcoding server required.
    link: /media/uploads
  - icon: 🛠️
    title: For developers
    details: Monorepo layout, NIP-71 video events and architecture decisions.
    link: /developers/
---

![Nostube web app](/screenshots/web-home.webp)
