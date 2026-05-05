#!/usr/bin/env bun
/**
 * ContextVM Client Template
 *
 * A complete starter template for building MCP clients with ContextVM.
 */

import { Client } from '@modelcontextprotocol/sdk/client'
import {
  NostrClientTransport,
  PrivateKeySigner,
  ApplesauceRelayPool,
  EncryptionMode,
} from '@contextvm/sdk'

// Configuration
const CLIENT_PRIVATE_KEY = process.env.CLIENT_PRIVATE_KEY!
const SERVER_PUBKEY = process.env.SERVER_PUBKEY!
const RELAYS = process.env.RELAYS?.split(',') || [
  'wss://relay.contextvm.org',
  'wss://cvm.otherstuff.ai',
]

async function main() {
  // 1. Setup signer and relay handler
  const signer = new PrivateKeySigner(CLIENT_PRIVATE_KEY)
  const relayPool = new ApplesauceRelayPool(RELAYS)
  const clientPubkey = await signer.getPublicKey()

  console.log(`Client Public Key: ${clientPubkey}`)
  console.log(`Target Server: ${SERVER_PUBKEY}`)
  console.log(`Relays: ${RELAYS.join(', ')}`)

  // 2. Configure ContextVM transport
  const transport = new NostrClientTransport({
    signer,
    relayHandler: relayPool,
    serverPubkey: SERVER_PUBKEY,
    encryptionMode: EncryptionMode.OPTIONAL,
    // Optional: Skip initialization for faster connections
    // isStateless: true,
  })

  // 3. Create and connect MCP client
  const client = new Client({
    name: 'cvm-starter-client',
    version: '1.0.0',
  })

  console.log('Connecting to server...')
  await client.connect(transport)
  console.log('✓ Connected')

  try {
    // 4. List available tools
    console.log('\n--- Available Tools ---')
    const tools = await client.listTools()
    for (const tool of tools.tools) {
      console.log(`- ${tool.name}: ${tool.description}`)
    }

    // 5. Call a tool (example)
    console.log('\n--- Testing Tool Call ---')
    const result = await client.callTool({
      name: 'echo',
      arguments: { message: 'Hello from ContextVM!' },
    })

    console.log('Result:', result)

    // 6. List resources (if available)
    console.log('\n--- Available Resources ---')
    try {
      const resources = await client.listResources()
      for (const resource of resources.resources) {
        console.log(`- ${resource.name}: ${resource.description}`)
      }
    } catch {
      console.log('(No resources available)')
    }
  } finally {
    // 7. Clean up
    await client.close()
    console.log('\n✓ Connection closed')
  }
}

main().catch(error => {
  console.error('Client failed:', error)
  process.exit(1)
})
