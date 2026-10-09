import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { scryptAsync } from '@noble/hashes/scrypt.js'
import { bech32 } from '@scure/base'
import { nip19 } from 'nostr-tools'

const VERSION = 0x02
const SALT_LENGTH = 16
const NONCE_LENGTH = 24
const PRIVATE_KEY_LENGTH = 32
const CIPHERTEXT_LENGTH = PRIVATE_KEY_LENGTH + 16
const PAYLOAD_LENGTH = 1 + 1 + SALT_LENGTH + NONCE_LENGTH + 1 + CIPHERTEXT_LENGTH

export const DEFAULT_NIP49_LOG_N = 16
export const NIP49_RAW_KEY_CONFIRMATION = 'show my raw key'

export type Nip49KeySecurity = 'insecure' | 'secure' | 'unknown'

const keySecurityBytes: Record<Nip49KeySecurity, number> = {
  insecure: 0x00,
  secure: 0x01,
  unknown: 0x02,
}

export interface EncryptNsecOptions {
  logN?: number
  keySecurity?: Nip49KeySecurity
}

export interface DecryptedNcryptsec {
  privateKey: Uint8Array
  nsec: string
  logN: number
  keySecurity: Nip49KeySecurity
}

function normalizePassword(password: string): Uint8Array {
  return new TextEncoder().encode(password.normalize('NFKC'))
}

function decodeNsec(nsec: string): Uint8Array {
  const decoded = nip19.decode(nsec.trim())
  if (decoded.type !== 'nsec') {
    throw new Error('Expected an nsec private key')
  }
  return decoded.data
}

function getKeySecurity(byte: number): Nip49KeySecurity {
  if (byte === 0x00) return 'insecure'
  if (byte === 0x01) return 'secure'
  return 'unknown'
}

async function deriveKey(password: string, salt: Uint8Array, logN: number): Promise<Uint8Array> {
  return await scryptAsync(normalizePassword(password), salt, {
    N: 2 ** logN,
    r: 8,
    p: 1,
    dkLen: 32,
    maxmem: 2 ** logN * 128 * 8 + 1024 * 1024,
  })
}

export function isNcryptsec(value: string): boolean {
  return value.trim().toLowerCase().startsWith('ncryptsec1')
}

export async function encryptNsecToNcryptsec(
  nsec: string,
  password: string,
  options: EncryptNsecOptions = {}
): Promise<string> {
  if (!password) {
    throw new Error('Password is required to create an encrypted backup')
  }

  const privateKey = decodeNsec(nsec)
  const logN = options.logN ?? DEFAULT_NIP49_LOG_N
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH))
  const keySecurity = keySecurityBytes[options.keySecurity ?? 'secure']
  const associatedData = Uint8Array.of(keySecurity)
  const symmetricKey = await deriveKey(password, salt, logN)

  try {
    const ciphertext = xchacha20poly1305(symmetricKey, nonce, associatedData).encrypt(privateKey)
    const payload = new Uint8Array(PAYLOAD_LENGTH)
    let offset = 0
    payload[offset++] = VERSION
    payload[offset++] = logN
    payload.set(salt, offset)
    offset += SALT_LENGTH
    payload.set(nonce, offset)
    offset += NONCE_LENGTH
    payload[offset++] = keySecurity
    payload.set(ciphertext, offset)

    return bech32.encode('ncryptsec', bech32.toWords(payload), false)
  } finally {
    symmetricKey.fill(0)
  }
}

export async function decryptNcryptsec(
  ncryptsec: string,
  password: string
): Promise<DecryptedNcryptsec> {
  if (!password) {
    throw new Error('Password is required to unlock this key')
  }

  const decoded = bech32.decodeToBytes(ncryptsec.trim(), false)
  if (decoded.prefix !== 'ncryptsec') {
    throw new Error('Expected an ncryptsec encrypted key')
  }

  const payload = decoded.bytes
  if (payload.length !== PAYLOAD_LENGTH) {
    throw new Error('Invalid ncryptsec payload length')
  }

  let offset = 0
  const version = payload[offset++]
  if (version !== VERSION) {
    throw new Error('Unsupported ncryptsec version')
  }

  const logN = payload[offset++]
  const salt = payload.slice(offset, offset + SALT_LENGTH)
  offset += SALT_LENGTH
  const nonce = payload.slice(offset, offset + NONCE_LENGTH)
  offset += NONCE_LENGTH
  const keySecurityByte = payload[offset++]
  const ciphertext = payload.slice(offset)
  const symmetricKey = await deriveKey(password, salt, logN)

  try {
    const privateKey = xchacha20poly1305(
      symmetricKey,
      nonce,
      Uint8Array.of(keySecurityByte)
    ).decrypt(ciphertext)

    return {
      privateKey,
      nsec: nip19.nsecEncode(privateKey),
      logN,
      keySecurity: getKeySecurity(keySecurityByte),
    }
  } catch {
    throw new Error('Failed to unlock encrypted key. Check the password and try again.')
  } finally {
    symmetricKey.fill(0)
  }
}
