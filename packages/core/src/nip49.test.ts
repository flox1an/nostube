import { describe, expect, it } from 'vitest'
import { bytesToHex } from 'nostr-tools/utils'
import { nip19 } from 'nostr-tools'
import { decryptNcryptsec, encryptNsecToNcryptsec, isNcryptsec } from './nip49'

const specVector =
  'ncryptsec1qgg9947rlpvqu76pj5ecreduf9jxhselq2nae2kghhvd5g7dgjtcxfqtd67p9m0w57lspw8gsq6yphnm8623nsl8xn9j4jdzz84zm3frztj3z7s35vpzmqf6ksu8r89qk5z2zxfmu5gv8th8wclt0h4p'

describe('nip49', () => {
  it('decrypts the NIP-49 test vector', async () => {
    const result = await decryptNcryptsec(specVector, 'nostr')

    expect(bytesToHex(result.privateKey)).toBe(
      '3501454135014541350145413501453fefb02227e449e57cf4d3a3ce05378683'
    )
    expect(result.logN).toBe(16)
  })

  it('round-trips an nsec as ncryptsec', async () => {
    const nsec = nip19.nsecEncode(
      Uint8Array.from([
        0x35, 0x01, 0x45, 0x41, 0x35, 0x01, 0x45, 0x41, 0x35, 0x01, 0x45, 0x41, 0x35, 0x01, 0x45,
        0x3f, 0xef, 0xb0, 0x22, 0x27, 0xe4, 0x49, 0xe5, 0x7c, 0xf4, 0xd3, 0xa3, 0xce, 0x05, 0x37,
        0x86, 0x83,
      ])
    )
    const encrypted = await encryptNsecToNcryptsec(nsec, 'correct horse battery staple')
    const decrypted = await decryptNcryptsec(encrypted, 'correct horse battery staple')

    expect(isNcryptsec(encrypted)).toBe(true)
    expect(decrypted.nsec).toBe(nsec)
  })
})
