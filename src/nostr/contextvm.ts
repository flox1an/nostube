/**
 * ContextVM MCP client singleton for trust score queries.
 *
 * Uses Nostr-based transport to communicate with a ContextVM server
 * via the Model Context Protocol (MCP).
 */
import { Client } from '@modelcontextprotocol/sdk/client'
import { NostrClientTransport, PrivateKeySigner, ApplesauceRelayPool } from '@contextvm/sdk'
import { nip19 } from 'nostr-tools'

// ContextVM server identity
const SERVER_NPUB = 'npub16w48u4xvtlp7ywgfsjlud74tlgdfx9s33scdlafmgl3a40n9tthsu6ty8g'
const CONTEXTVM_RELAYS = ['wss://relay2.contextvm.org']

// Decode server npub to hex
const decoded = nip19.decode(SERVER_NPUB)
const SERVER_PUBKEY_HEX = decoded.data as string

/** Individual validator score from ContextVM */
export interface ValidatorScore {
  score: number
  description?: string
}

/** Trust score result from ContextVM */
export interface TrustScoreResult {
  sourcePubkey: string
  targetPubkey: string
  score: number
  components: {
    distanceWeight: number
    socialDistance: number
    normalizedDistance: number
    validators: Record<string, ValidatorScore>
  }
  computedAt: string
}

/**
 * Pubkey of the NosTube video validator set in relatr.
 * Currently available indicators:
 * - video_creator_activity
 * - video_viewer_engagement
 * - video_creator_comments
 */
const VIDEO_INDICATORS = new Set([
  'video_creator_activity',
  'video_viewer_engagement',
  'video_creator_comments',
])

/**
 * Calculate a global (non-personalized) score from the available video indicators,
 * multiplied by the report_penalty if relatr returns one.
 *
 * globalScore = avg(video_creator_activity, video_viewer_engagement, video_creator_comments)
 *             × report_penalty?
 *
 * report_penalty defaults to 1.0 when it is not present.
 */
export function getGlobalScore(result: TrustScoreResult): number | null {
  const validators = result.components?.validators
  if (!validators || typeof validators !== 'object') return null

  const videoScores: number[] = []
  for (const [key, val] of Object.entries(validators)) {
    const indicator = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key
    if (VIDEO_INDICATORS.has(indicator)) {
      videoScores.push(val.score)
    }
  }

  if (videoScores.length === 0) return null
  return videoScores.reduce((sum, s) => sum + s, 0) / videoScores.length
}

// Singleton state
let activeClient: Client | null = null
let activeTransport: NostrClientTransport | null = null
let activeRelayPool: ApplesauceRelayPool | null = null

/**
 * Connect to the ContextVM server using a private key for signing.
 * Returns the MCP Client instance ready for tool calls.
 */
export async function connectContextVM(privateKeyHex: string): Promise<Client> {
  // Reuse existing connection
  if (activeClient) {
    if (import.meta.env.DEV) console.log('[ContextVM] Reusing existing connection')
    return activeClient
  }

  if (import.meta.env.DEV) {
    console.log('[ContextVM] Connecting to server:', SERVER_NPUB)
    console.log('[ContextVM] Using relays:', CONTEXTVM_RELAYS)
  }

  const signer = new PrivateKeySigner(privateKeyHex)
  const relayPool = new ApplesauceRelayPool(CONTEXTVM_RELAYS)

  const transport = new NostrClientTransport({
    serverPubkey: SERVER_PUBKEY_HEX,
    signer,
    relayHandler: relayPool,
    isStateless: true,
  })

  const client = new Client({
    name: 'nostube',
    version: '1.0.0',
  })

  try {
    await client.connect(transport)
    if (import.meta.env.DEV) console.log('[ContextVM] Connected successfully')
  } catch (error) {
    console.error('[ContextVM] Connection failed:', error)
    throw error
  }

  activeClient = client
  activeTransport = transport
  activeRelayPool = relayPool

  return client
}

/**
 * Disconnect from the ContextVM server and clean up resources.
 */
export async function disconnectContextVM(): Promise<void> {
  if (activeClient) {
    try {
      await activeClient.close()
    } catch {
      // Ignore close errors
    }
    activeClient = null
  }

  if (activeTransport) {
    try {
      await activeTransport.close()
    } catch {
      // Ignore close errors
    }
    activeTransport = null
  }

  if (activeRelayPool) {
    try {
      await activeRelayPool.disconnect()
    } catch {
      // Ignore disconnect errors
    }
    activeRelayPool = null
  }
}

/**
 * Calculate trust score for a single target pubkey.
 */
export async function calculateTrustScore(
  client: Client,
  targetPubkey: string
): Promise<TrustScoreResult | null> {
  try {
    const result = await client.callTool({
      name: 'calculate_trust_score',
      arguments: { targetPubkey },
    })

    return parseMcpToolResult(result)
  } catch (error) {
    console.error('[ContextVM] Error calculating trust score:', error)
    return null
  }
}

/**
 * Calculate trust scores for multiple target pubkeys in a single batch call.
 */
export async function calculateTrustScores(
  client: Client,
  targetPubkeys: string[]
): Promise<TrustScoreResult[]> {
  if (targetPubkeys.length === 0) return []

  try {
    if (import.meta.env.DEV) {
      console.log('[ContextVM] Batch requesting trust scores for', targetPubkeys.length, 'pubkeys')
    }
    const result = await client.callTool({
      name: 'calculate_trust_scores',
      arguments: { targetPubkeys },
    })

    const scores = parseMcpToolResults(result)
    if (import.meta.env.DEV) {
      console.log('[ContextVM] Got', scores.length, 'scores for', targetPubkeys.length, 'requested')
    }
    return scores
  } catch (error) {
    console.error('[ContextVM] Error calculating trust scores:', error)
    return []
  }
}

// ---------------------------------------------------------------------------
// MCP result parsing helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTextContent(result: any): string | null {
  if (!result) return null
  // Check content array for text blocks
  if ('content' in result && Array.isArray(result.content)) {
    const textBlock = result.content.find((c: { type: string; text?: string }) => c.type === 'text')
    if (textBlock?.text) return textBlock.text
  }
  return null
}

/**
 * Extract trust scores from MCP result, supporting both:
 * - content[].text (text-based response)
 * - structuredContent.trustScores (structured response)
 * - structuredContent.trustScore (single structured response)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTrustScores(result: any): TrustScoreResult[] {
  if (!result) return []

  // Try structuredContent first (preferred by relatr server)
  if (result.structuredContent) {
    const scores = extractTrustScoresFromPayload(result.structuredContent)
    if (scores.length > 0) return scores
  }

  // Fall back to text content
  try {
    const text = extractTextContent(result)
    if (!text) return []
    const parsed = JSON.parse(text)
    return extractTrustScoresFromPayload(parsed)
  } catch {
    return []
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractTrustScoresFromPayload(payload: any): TrustScoreResult[] {
  if (!payload) return []

  if (Array.isArray(payload)) return payload as TrustScoreResult[]
  if (Array.isArray(payload.trustScores)) return payload.trustScores as TrustScoreResult[]
  if (payload.trustScore) return [payload.trustScore as TrustScoreResult]

  return []
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseMcpToolResult(result: any): TrustScoreResult | null {
  const scores = extractTrustScores(result)
  return scores[0] ?? null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseMcpToolResults(result: any): TrustScoreResult[] {
  return extractTrustScores(result)
}
