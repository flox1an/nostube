# nostube

A Nostr-based video sharing platform built with React 18.x, TailwindCSS 3.x, Vite, shadcn/ui, and Applesauce.

Support for both landscape and portrait videos (shorts in 9:16 format).

## Embeddable Video Player

nostube includes a standalone embeddable video player that can be embedded on any website via iframe, similar to YouTube's embed player.

**Quick Example:**

```html
<iframe
  src="https://nostu.be/embed?v=nevent1qqs..."
  width="640"
  height="360"
  frameborder="0"
  allowfullscreen
>
</iframe>
```

**Features:**

- ✅ iframe-based embedding
- ✅ Native HTML5 video controls
- ✅ Content warning overlays
- ✅ Title and author overlays
- ✅ Custom accent colors
- ✅ ~35KB gzipped bundle

**Documentation:**

- [Embed Documentation](./public/embed-README.md) - Complete embedding guide
- [Interactive Examples](https://nostu.be/embed-examples.html) - Live demos

**Development:**

```bash
# Build embed player
npm run build:embed

# Watch mode
npm run build:embed:watch
```

## Development

```bash
npm install
npm run dev
```

## Docker Deployment

nostube can be deployed using Docker with runtime environment configuration. See [DOCKER.md](./DOCKER.md) for detailed instructions.

Quick start:

```bash
# Using Docker Compose
docker-compose up -d

# Using Docker CLI
docker build -t nostube:latest .
docker run -d -p 8080:80 nostube:latest
```

The application will be available at `http://localhost:8080`

## License

MIT
