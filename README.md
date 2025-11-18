# nostube

A Nostr-based video sharing platform built with React 18.x, TailwindCSS 3.x, Vite, shadcn/ui, and Applesauce.

Support for both landscape and portrait videos (shorts in 9:16 format).

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
