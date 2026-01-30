# nostube

A Nostr-based video sharing platform built with React 18.x, TailwindCSS 3.x, Vite, shadcn/ui, and Applesauce.

Support for both landscape and portrait videos (shorts in 9:16 format).

## Screenshots

### Homepage and User Menu

![Homepage and User Menu](https://blossom.primal.net/aa15a77306743f24d6f8d36f29ad3633429ba6d25aafc362e1363f2e4ded74bb.png)

### Short Videos

![Short Videos](https://blossom.primal.net/788fbb198bd84bb17937a5d793576c2f931b0a229dbaf78a6285400c484db818.png)

### Subscriptions with mixed videos

![Subscriptions with mixed videos](https://blossom.primal.net/a9f56395d8c326de805198597f1a3010d8f708cb8ce1eeb549777c76309d5bf8.png)

### Playlists

![Playlists](https://blossom.primal.net/d9e0a273077f0df5cd0cb05a74409b3956e28280fec1f39cb40c6f7d0affe458.png)

### Single Playlist View

![Single Playlist View](https://blossom.primal.net/9489e675046e5a26417bb8f8f767c9717e6a14f8db228ad5ed4ab56d2be07e1e.png)

### User Profile

![User Profile](https://blossom.primal.net/dbf80c54f60307d20590023e2d3083780690424a885719d3cc44664965921ea9.png)

### Long-form Video Player

![Long-form Video Player](https://blossom.primal.net/326d18020def625ff48099bbce5e2d299a5696e7fc128568b9ffcd5c4470e505.png)

### Comments

![Comments](https://blossom.primal.net/55b0c242fd77106d3ef0e808959f538d03a5900aa625e019e3aa7715b72dd940.png)

### Upload

![Upload](https://blossom.primal.net/58ab786d8ec1bcb18f7e8fe9b23f744cf53a7cfc8d65191355414044411555c2.png)

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
