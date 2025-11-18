# Docker Deployment Guide

This guide explains how to build and run nostube using Docker with runtime environment configuration.

## Quick Start

### Using Docker Compose (Recommended)

```bash
# Build and start the container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the container
docker-compose down
```

The application will be available at `http://localhost:8080`

### Using Docker CLI

```bash
# Build the image
docker build -t nostube:latest .

# Run the container
docker run -d \
  -p 8080:80 \
  --name nostube \
  -e RUNTIME_RELAYS="wss://relay.divine.video,wss://relay.damus.io" \
  -e RUNTIME_BLOSSOM_SERVERS="https://almond.slidestr.net" \
  nostube:latest

# View logs
docker logs -f nostube

# Stop the container
docker stop nostube
docker rm nostube
```

## Runtime Environment Configuration

The Docker image supports runtime environment configuration through `RUNTIME_*` prefixed environment variables. These are injected when the container starts and can be modified without rebuilding the image.

### Available Environment Variables

| Variable                  | Description                                 | Default                                                       |
| ------------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| `RUNTIME_RELAYS`          | Comma-separated list of Nostr relay URLs    | `wss://relay.divine.video,wss://relay.damus.io,wss://nos.lol` |
| `RUNTIME_BLOSSOM_SERVERS` | Comma-separated list of Blossom server URLs | `https://almond.slidestr.net`                                 |
| `RUNTIME_APP_TITLE`       | Application title                           | `Nostube`                                                     |
| `RUNTIME_DEBUG`           | Enable debug mode (true/false)              | `false`                                                       |
| `RUNTIME_CUSTOM_CONFIG`   | Custom JSON configuration                   | `null`                                                        |

### Example Configurations

#### Production with Multiple Relays

```yaml
environment:
  - RUNTIME_RELAYS=wss://relay.divine.video,wss://relay.damus.io,wss://nos.lol,wss://relay.snort.social,wss://relay.nostr.band
  - RUNTIME_BLOSSOM_SERVERS=https://almond.slidestr.net,https://cdn.satellite.earth,https://blossom.primal.net
  - RUNTIME_DEBUG=false
```

#### Development with Debug Enabled

```yaml
environment:
  - RUNTIME_RELAYS=wss://localhost:7777,wss://relay.divine.video
  - RUNTIME_DEBUG=true
  - RUNTIME_APP_TITLE=Nostube Dev
```

#### Custom Configuration

```yaml
environment:
  - RUNTIME_CUSTOM_CONFIG={"feature_flags":{"experimental":true,"beta":true},"max_upload_size":104857600}
```

## Accessing Runtime Configuration in Code

The runtime configuration is available via the `window.__RUNTIME_ENV__` object:

```javascript
// Access configuration
const relays = window.__RUNTIME_ENV__.RELAYS
const debug = window.__RUNTIME_ENV__.DEBUG === 'true'

// Parse comma-separated values
const relayList = window.__RUNTIME_ENV__.parseCSV(window.__RUNTIME_ENV__.RELAYS)
// Returns: ["wss://relay.divine.video", "wss://relay.damus.io", ...]

// Access custom config
const customConfig = JSON.parse(window.__RUNTIME_ENV__.CUSTOM_CONFIG || '{}')
```

## Multi-Stage Build Details

The Dockerfile uses a multi-stage build to optimize image size:

1. **Builder Stage** (node:20-alpine)
   - Installs dependencies
   - Builds the application
   - Size: ~1GB (discarded)

2. **Runtime Stage** (nginx:alpine)
   - Copies only the compiled `/dist` folder
   - Includes nginx web server
   - Generates runtime configuration on startup
   - Final size: ~50MB

## Production Deployment

### Kubernetes Example

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nostube
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nostube
  template:
    metadata:
      labels:
        app: nostube
    spec:
      containers:
        - name: nostube
          image: nostube:latest
          ports:
            - containerPort: 80
          env:
            - name: RUNTIME_RELAYS
              value: 'wss://relay.divine.video,wss://relay.damus.io'
            - name: RUNTIME_BLOSSOM_SERVERS
              value: 'https://almond.slidestr.net'
          livenessProbe:
            httpGet:
              path: /health
              port: 80
            initialDelaySeconds: 5
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /health
              port: 80
            initialDelaySeconds: 3
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: nostube
spec:
  selector:
    app: nostube
  ports:
    - port: 80
      targetPort: 80
  type: LoadBalancer
```

### Environment File

Create a `.env` file for docker-compose:

```bash
# .env
RUNTIME_RELAYS=wss://relay.divine.video,wss://relay.damus.io,wss://nos.lol
RUNTIME_BLOSSOM_SERVERS=https://almond.slidestr.net,https://cdn.satellite.earth
RUNTIME_APP_TITLE=Nostube
RUNTIME_DEBUG=false
```

Then use it:

```bash
docker-compose --env-file .env up -d
```

## Health Checks

The container includes a health check endpoint at `/health` that returns `200 OK` when the application is running properly.

```bash
# Check container health
docker inspect --format='{{.State.Health.Status}}' nostube

# Manual health check
curl http://localhost:8080/health
```

## Nginx Configuration

The nginx configuration includes:

- **SPA Routing**: All non-file requests return `index.html` for client-side routing
- **Gzip Compression**: Enabled for text assets
- **Caching**: 1-year cache for static assets, no cache for `index.html` and `runtime-env.js`
- **Security Headers**: X-Frame-Options, X-Content-Type-Options, CSP, etc.
- **Health Endpoint**: `/health` for container orchestration

## Troubleshooting

### View Runtime Configuration

```bash
# Check what environment variables were set
docker exec nostube env | grep RUNTIME_

# View generated runtime-env.js
docker exec nostube cat /usr/share/nginx/html/runtime-env.js
```

### Container Logs

```bash
# Docker Compose
docker-compose logs -f nostube

# Docker CLI
docker logs -f nostube
```

### Debug Build Issues

```bash
# Build without cache
docker build --no-cache -t nostube:latest .

# Build with progress
docker build --progress=plain -t nostube:latest .
```

### Common Issues

1. **Port already in use**: Change the host port in docker-compose.yml or use `-p 9090:80`
2. **Container exits immediately**: Check logs with `docker logs nostube`
3. **Changes not reflected**: Runtime env changes require container restart: `docker-compose restart`
4. **Build errors**: Ensure Node.js version compatibility (requires Node 20+)

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Build and Push Docker Image

on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and export
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./Dockerfile
          push: false
          tags: nostube:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

## Security Considerations

1. **CSP Headers**: Adjust Content-Security-Policy in `docker/nginx.conf` for your deployment
2. **Secrets**: Never commit `.env` files with sensitive data
3. **HTTPS**: Use a reverse proxy (nginx, Traefik, Caddy) for TLS termination in production
4. **Updates**: Regularly rebuild images to get security updates from base images

## License

Same as the main nostube project.
