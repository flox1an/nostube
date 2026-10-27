// Node 22+ ships a global localStorage stub without its methods, which hides jsdom's; the Nostr
// account persistence (login dialog, restore) needs a real Storage.
function storage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
  }
}
Object.defineProperty(globalThis, 'localStorage', { value: storage() })
Object.defineProperty(globalThis, 'sessionStorage', { value: storage() })

// The studio scrolls to the top on page changes; jsdom only logs "not implemented".
if (typeof window !== 'undefined') window.scrollTo = () => {}

// jsdom's TextEncoder returns a Uint8Array from another realm, which noble (inside applesauce's
// event verification) refuses; copy it into this realm's Uint8Array.
const Encoder = globalThis.TextEncoder
globalThis.TextEncoder = class extends Encoder {
  encode(input?: string) {
    return new Uint8Array(super.encode(input))
  }
} as typeof TextEncoder
