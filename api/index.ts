import { SimplePool } from 'nostr-tools/pool'
import { decode } from 'nostr-tools/nip19'
import type { NostrEvent } from 'nostr-tools/pure'
import type { Filter } from 'nostr-tools/filter'

export const config = { runtime: 'edge' }

const FALLBACK_RELAYS = [
  'wss://relay.nostu.be',
  'wss://relay.divine.video',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
]

const NADDR =
  'naddr1qvzqqqy9hvpzqe9l4x4lled335rnrmk40vupwwku9w5fh7ruz6x6jpgh7qs7wg44qy28wumn8ghj7un9d3shjtnyv9kh2uewd9hsz9nhwden5te0wfjkccte9ec8y6tdv9kzumn9wsqs6amnwvaz7tmwdaejumr0dsqpwanfv3jk7ttdd4nksctsx43z663ewaaxjdmfdufudnhe'

export default async function handler() {
  try {
    const decoded = decode(NADDR)
    if (decoded.type !== 'naddr') {
      return Response.json({ error: 'not an naddr' }, { status: 400 })
    }

    const { kind, pubkey, identifier, relays: hintRelays } = decoded.data
    const relays = [...new Set([...(hintRelays ?? []), ...FALLBACK_RELAYS])]
    const filter: Filter = { kinds: [kind], authors: [pubkey], '#d': [identifier] }

    const pool = new SimplePool()

    const event = await Promise.race([
      new Promise<NostrEvent | null>((resolve) => {
        let settled = false
        const sub = pool.subscribeMany(relays, [filter], {
          onevent(ev) {
            if (!settled) {
              settled = true
              sub.close()
              resolve(ev)
            }
          },
          oneose() {
            if (!settled) {
              settled = true
              sub.close()
              resolve(null)
            }
          },
        })
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ])

    try {
      pool.close(relays)
    } catch {
      /* ignore */
    }

    if (!event) {
      return Response.json({ error: 'event not found', filter, relays }, { status: 404 })
    }

    return Response.json({ ok: true, event })
  } catch (err: unknown) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
