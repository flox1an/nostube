import type { NostrEvent } from 'nostr-tools'

const BLOSSOM_AUTH_KIND = 24242
const AUTH_EXPIRATION_SECONDS = 60 * 60

type BlossomAuthorizationType = 'delete' | 'upload'

export interface BlobDescriptor {
  uploaded: number
  type?: string
  sha256: string
  size: number
  url: string
}

export interface BlossomAuthEventTemplate {
  created_at: number
  kind: number
  content: string
  tags: string[][]
}

export type Signer = (draft: BlossomAuthEventTemplate) => Promise<NostrEvent>
export async function createBlossomAuthorization(
  signer: Signer,
  type: BlossomAuthorizationType,
  sha256: string,
  server?: string
): Promise<NostrEvent> {
  const createdAt = Math.floor(Date.now() / 1000)

  return signer({
    kind: BLOSSOM_AUTH_KIND,
    created_at: createdAt,
    content: type === 'upload' ? 'Upload Blob' : 'Delete Blob',
    tags: [
      ['t', type],
      ['expiration', String(createdAt + AUTH_EXPIRATION_SECONDS)],
      ['x', sha256],
      ...(server ? [['server', server]] : []),
    ],
  })
}
