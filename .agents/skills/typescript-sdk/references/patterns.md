# SDK Patterns

## Connection Lifecycle

### Graceful Shutdown

```typescript
async function gracefulShutdown(client: Client, relayPool: RelayHandler): Promise<void> {
  await client.close()
  await relayPool.disconnect()
}

process.on('SIGINT', () => gracefulShutdown(client, relayPool))
process.on('SIGTERM', () => gracefulShutdown(client, relayPool))
```

### Connection Health Check

```typescript
async function isConnectionHealthy(client: Client): Promise<boolean> {
  try {
    await Promise.race([
      client.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ])
    return true
  } catch {
    return false
  }
}
```

## Resource Cleanup

Use `AsyncDisposable` pattern:

```typescript
class ManagedClient implements AsyncDisposable {
  private client: Client
  private transport: NostrClientTransport

  async dispose() {
    await this.client.close()
    // Transport cleanup handled by client
  }
}

// Usage
{
  await using managed = new ManagedClient()
  // Use client
} // Auto-disposed
```
