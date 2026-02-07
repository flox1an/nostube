import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extractBlossomHash, processEvent, processEvents } from './video-event'
import type { BlossomServer } from '@/contexts/AppContext'

// Mock dependencies
vi.mock('@/workers/blurhashDataURL', () => ({
  blurHashToDataURL: vi.fn((blurhash?: string) =>
    blurhash ? `data:image/webp;base64,mock-${blurhash}` : undefined
  ),
}))

vi.mock('applesauce-core/helpers/relays', () => ({
  getSeenRelays: vi.fn(() => undefined),
}))

vi.mock('nostr-tools', () => ({
  nip19: {
    neventEncode: vi.fn(({ id, author }) => `nevent1${id}-${author || 'no-author'}`),
    naddrEncode: vi.fn(({ identifier }) => `naddr1${identifier || 'mock'}`),
  },
}))

vi.mock('@/lib/video-types', () => ({
  getTypeForKind: vi.fn((kind: number) => {
    if (kind === 21 || kind === 34235) return 'horizontal'
    if (kind === 22 || kind === 34236) return 'vertical'
    return 'horizontal'
  }),
  getKindsForType: vi.fn((type: string) => {
    if (type === 'shorts') return [34236, 22]
    if (type === 'videos') return [34235, 21]
    return [34235, 34236, 21, 22]
  }),
}))

vi.mock('@/lib/media-url-generator', () => ({
  generateMediaUrls: vi.fn(({ urls }) => ({ urls })),
}))

// Real event data from docs/example-events.md
const zapStreamEvent = {
  content: '',
  created_at: 1763167655,
  id: 'a7d069594fb44e5d917468343fa54f58a13eeef1cd54961e6c3590e8d7accc7b',
  kind: 21,
  pubkey: 'fd2ee25fd0ef442aa1b7404a9354b12e554ec0dead81a6c8bdb8cda2ff09373f',
  sig: '93ae464d75d9fb29d6d2fe1589b6abeae501eab3188f505d72638b41b3917f0914f4be287e9a887ba678faf4d71f34481b075abb6e0e35990f69489ee2a8ca36',
  tags: [
    [
      'imeta',
      'url https://nostr.download/f6551d07b3ad65b6137780a68b5492ea541182fc16717d21b18cedfb8d6ef4d0.mp4',
      'm video/mp4; codecs="avc1"',
      'x f6551d07b3ad65b6137780a68b5492ea541182fc16717d21b18cedfb8d6ef4d0',
      'size 23323611',
      'dim 1280x720',
      'thumb https://nostr.download/thumb/f6551d07b3ad65b6137780a68b5492ea541182fc16717d21b18cedfb8d6ef4d0.webp',
      'duration 281.73062',
      'bitrate 662295',
      'image https://nostr.download/2effc7a4cc306245f28766587e3a3036585cf531fb3dfb1c6d47438b1fb6529b.webp',
    ],
    ['title', 'Left Unknown - Strange Love'],
    ['client', 'zap.stream', 'v0.5.0-59-gb05ddab'],
  ],
}

const nostubeEvent = {
  content: 'Animated nostube logo',
  created_at: 1763047346,
  id: '50fcc8ad1a0a9ffae95c035111f6850aeaa4f0f01d20a610da985c30c4df66d6',
  kind: 21,
  pubkey: 'b7c6f6915cfa9a62fff6a1f02604de88c23c6c6c6d1b8f62c7cc10749f307e81',
  sig: 'b6ec89770878a783510ca5f37afcf2e4d29a1fd7be18d2a2b36ac109b2f4eb0bbb9ae99a2c718b77eebc23b4cecb679c803d23e1633ef290f62b790ee0db2963',
  tags: [
    ['title', 'nostube logo'],
    ['alt', 'Animated nostube logo'],
    ['published_at', '1763047346'],
    ['duration', '4'],
    [
      'imeta',
      'dim 1920x1080',
      'url https://almond.slidestr.net/0d1991b81fae8148cebdedbd4658c5d0873871620c248f1df60dda5b24e0999e.mp4',
      'x 0d1991b81fae8148cebdedbd4658c5d0873871620c248f1df60dda5b24e0999e',
      'm video/mp4; codecs="hvc1.2.4.L120.b0,mp4a.40.2"',
      'bitrate 1325520.0414373584',
      'image https://almond.slidestr.net/a3a9cb9757f48dd7279cdd0473934ee1799f3a3e969b391f6e16d746b0c43057.png',
      'image https://blossom.primal.net/a3a9cb9757f48dd7279cdd0473934ee1799f3a3e969b391f6e16d746b0c43057.png',
      'fallback https://blossom.primal.net/0d1991b81fae8148cebdedbd4658c5d0873871620c248f1df60dda5b24e0999e.mp4',
    ],
    ['L', 'ISO-639-1'],
    ['l', 'en', 'ISO-639-1'],
    ['client', 'nostube'],
  ],
}

const nostrBuildEvent = {
  content: 'Highlights and Twitter posts on #Jumble Imwald 🌲 RSS feed.',
  created_at: 1762962845,
  id: 'f000535faa7e410dc084bcd4437a46fe2279e5c46fd8c700eabbdeac79d76271',
  kind: 21,
  pubkey: 'dd664d5e4016433a8cd69f005ae1480804351789b59de5af06276de65633d319',
  sig: 'c290b6c4d35e22c6fde07ac6dd1c67f89c61353174d7808eca392d867d15a5a37d7cbb098d18a0590b90721df2cbfe2b4809897ebbb1456bf63a4c36653f169a',
  tags: [
    ['title', 'screen-20251112-165044.mp4'],
    ['published_at', '1762962845'],
    ['imeta', 'url https://v.nostr.build/RIbToHsVig5gjGLf.mp4', 'm video/mp4'],
    ['r', 'https://v.nostr.build/RIbToHsVig5gjGLf.mp4'],
    ['t', '#jumble'],
  ],
}

const verticalVideoEvent = {
  content: 'Marin 💕✨\nOriginally published in: 2025-11-13',
  created_at: 1763179480,
  id: '0000c09aa7133e2e75e7e352af918c56e7a8cafc4ed456a67a24dc4a9f777272',
  kind: 22,
  pubkey: '5943c88f3c60cd9edb125a668e2911ad419fc04e94549ed96a721901dd958372',
  sig: '53badb2a42b0b147252b0ac23545773a50ec123c9761da6e910a7c37f046dccae51e7174d5498ff83e4a33987c9a618808b62d7c34b09abaafec4b543b6ed819',
  tags: [
    ['alt', 'Vertical Video'],
    ['title', ''],
    ['published_at', '1763179481'],
    [
      'imeta',
      'url https://blossom.primal.net/cf5a5ff1dddc3b97d8938f33d1088c9e5babcdc3f94c5178112392e9b3a36d27.mp4',
      'm video/mp4',
      'alt Vertical Video',
      'x cf5a5ff1dddc3b97d8938f33d1088c9e5babcdc3f94c5178112392e9b3a36d27',
      'size 3069605',
      'dim 720x1280',
      'blurhash _FF}~1~p%z-p~W0fE2.S?aNH^+xu%gt79ZIV-WWVNaxu-:IpjG%MNHoMsAR,S6kCX5NxofxZNGf,W.slt7X8bFs:%1WARkxFslR*R*xDV@kDjFnOoft7WBs;t7oKafs;of',
    ],
    ['nonce', '229', '16'],
  ],
}

const yakihonneHorizontalEvent = {
  content:
    "Reed in. Reed out. Getting the water reed laid on a roof is what it's all about. Work. Create value. Store your energy in hard money. #bitcoin",
  created_at: 1763202103,
  id: '90fa570cf58b53e42f734092ae5b99d53b37452d835883141cfaa1f31b0a5ffd',
  kind: 34235,
  pubkey: 'd996ace530c16e4d43c419ae2b1e0f01e3a620470e21a0347a055f340ee1cfdf',
  sig: '88cedda706c4332e7c5c680b2e0755b6a2b57856dca3d3a048e4316abd1727115de8b167c4aef86ff644cc91a22e08526c36a88cffd49799ad7646b987b899c4',
  tags: [
    [
      'client',
      'Yakihonne',
      '31990:20986fb83e775d96d188ca5c9df10ce6d613e0eb7e5768a0f0b12b37cdac21b3:1700732875747',
    ],
    ['d', 'YG0jA04d_aH5HUYUoBT-q'],
    [
      'imeta',
      'url https://518.kiwi/wp-content/uploads/2025/11/Loading-Reed.mp4',
      'image https://518.kiwi/wp-content/uploads/2025/11/Water-Reed-in-Barn-Boglander.jpg',
      'm video/mp4',
    ],
    ['url', 'https://518.kiwi/wp-content/uploads/2025/11/Loading-Reed.mp4'],
    ['title', 'The Roof Thatching Train Never Stops'],
    [
      'summary',
      "Reed in. Reed out. Getting the water reed laid on a roof is what it's all about. Work. Create value. Store your energy in hard money. #bitcoin",
    ],
    ['published_at', '1763202103'],
    ['m', 'video/mp4'],
    ['duration', '0'],
    ['size', '0'],
    ['t', 'thatching'],
    ['t', 'bitcoin'],
    ['t', 'crafts'],
    ['thumb', 'https://518.kiwi/wp-content/uploads/2025/11/Water-Reed-in-Barn-Boglander.jpg'],
    ['image', 'https://518.kiwi/wp-content/uploads/2025/11/Water-Reed-in-Barn-Boglander.jpg'],
  ],
}

const oldFormatEvent = {
  content:
    'Release Explorer: https://releases.tollgate.me/\nSignal Deployment Group: https://signal.group/#CjQKIFUj7wFVxIbHjujYAWGTKeMIvi1DdVYk2Zem3uNlmIwWEhAiFlw7arUvnitB1V0_cTaA',
  created_at: 1761147398,
  id: 'a306b69c8a506a03c1a83a4bd5ce1f9adfecfe65bdf287f1bb756ed1912fe71a',
  kind: 34235,
  pubkey: 'bbb5dda0e15567979f0543407bdc2033d6f0bbb30f72512a981cfdb2f09e2747',
  sig: '74a7954874223da724ee1386f93ee29dba2ddf9efeeec5f243a67c2c46d210dbce888c269ade4bf2ab8a08041eef3a0729b116bd9771d9887cc98c8589a01eba',
  tags: [
    ['d', 'ee4ec8d9eb9692dabbd4ed1b0bce3c101d70780b94c28a99fb9f4adfdee26921'],
    ['x', 'ee4ec8d9eb9692dabbd4ed1b0bce3c101d70780b94c28a99fb9f4adfdee26921'],
    [
      'url',
      'https://blossom.primal.net/ee4ec8d9eb9692dabbd4ed1b0bce3c101d70780b94c28a99fb9f4adfdee26921.mp4',
    ],
    [
      'summary',
      'Release Explorer: https://releases.tollgate.me/\nSignal Deployment Group: https://signal.group/#CjQKIFUj7wFVxIbHjujYAWGTKeMIvi1DdVYk2Zem3uNlmIwWEhAiFlw7arUvnitB1V0_cTaA',
    ],
    ['published_at', '1761147398'],
    ['client', 'bouquet'],
    ['title', 'Flash your TollGate'],
    ['size', '478688107'],
    ['m', 'video/mp4'],
  ],
}

const verticalAddressableEvent = {
  content: '跳个舞 #美女 #东北甜妹 #可爱女人',
  created_at: 1762995462,
  id: '000007bd3539aa9a4dda433d6e8fdc2806323f46765ee4c91146e5f34827f3fc',
  kind: 34236,
  pubkey: '7444faae22d4d4939c815819dca3c4822c209758bf86afc66365db5f79f67ddb',
  sig: 'b33db58b7ad85691aaf564a93560b6baeaec772a44c9504e6067505d0a0e2b695e334fb9430780b8efd7f76ec27a26159f0b9924259780dceaf044c907e77411',
  tags: [
    ['alt', 'Vertical Video'],
    ['title', ''],
    ['published_at', '1762995459'],
    [
      'imeta',
      'url https://nostr.download/8c06494baacec723004d62456b79a8c33a333778414b161afed0607de1f10878.mp4',
      'm video/mp4',
      'alt Vertical Video',
      'x 8c06494baacec723004d62456b79a8c33a333778414b161afed0607de1f10878',
      'size 2879608',
      'dim 1080x1920',
      'blurhash _012.[R%ofbbWBkCWBxuRjbHofWBt7WBt6afofWBR*offPbFf8oejZa#jtkCWUWDWUoMs:WBofs:j[WBj[j[R*j[ayayazj@j@j]ayofjta#ayWUj[f6fQayj[j[ayfkfj',
    ],
    ['d', '8c06494baacec723004d62456b79a8c33a333778414b161afed0607de1f10878'],
    ['nonce', '471304', '20'],
  ],
}

const flareVideoEvent = {
  content:
    'Jordan Peterson diz a Tara Brown que igualdade obrigatória é economicamente inviável e condenada ao fracasso.',
  created_at: 1737782562,
  id: '8e3ca96b7798fa06572292fcdae9179419f3887cd06663ac2c0ec02d426e07d0',
  kind: 34235,
  pubkey: '8865df34d15f5c650a470f7e5cf1463ae49e9f02e516cf91016fa39df54b7a10',
  sig: 'c03d6c9d627a263bd03e178cd23fa287dbad4fae9c378aa1b56686feb562010b2a84d68d9d7a29d2deef863086c53ae16cee58c022722b78f7c3c73dc8472f3c',
  tags: [
    ['d', 'xPm0W3f'],
    ['url', 'https://1a-1791.com/video/s8/2/h/W/R/q/hWRqb.caa.1.mp4?u=0&b=0'],
    ['title', 'Igualdade - Jordan Peterson\n'],
    [
      'summary',
      'Jordan Peterson diz a Tara Brown que igualdade obrigatória é economicamente inviável e condenada ao fracasso.',
    ],
    ['published_at', '1737782562'],
    ['client', 'flare'],
    [
      'alt',
      'This is a video event and can be viewed at https://www.flare.pub/w/naddr1qqrhs5rdxptnxeszyzyxthe56904ceg2gu8huh83gcawf85lqtj3dnu3q9h68804fdapqqcyqqqgtwcu7y26n',
    ],
    ['t', 'Jordan'],
    ['t', 'Peterson'],
    ['t', 'igualdade'],
  ],
}

const eventWithOriginTag = {
  content: 'Imported video from YouTube',
  created_at: 1763300000,
  id: 'origin-test-event-id',
  kind: 34235,
  pubkey: 'test-pubkey',
  sig: 'test-signature',
  tags: [
    ['d', 'imported-video-123'],
    ['imeta', 'url https://example.com/imported-video.mp4', 'm video/mp4'],
    ['title', 'Imported Video Title'],
    [
      'origin',
      'youtube',
      'dQw4w9WgXcQ',
      'https://youtube.com/watch?v=dQw4w9WgXcQ',
      'uploaded:2020-01-01',
    ],
    ['t', 'imported'],
  ],
}

const eventWithOriginOldFormat = {
  content: 'Imported from Vimeo',
  created_at: 1763300100,
  id: 'origin-old-format-id',
  kind: 34235,
  pubkey: 'test-pubkey-2',
  sig: 'test-signature-2',
  tags: [
    ['d', 'vimeo-import-456'],
    ['url', 'https://example.com/vimeo-video.mp4'],
    ['title', 'Vimeo Import'],
    ['m', 'video/mp4'],
    ['origin', 'vimeo', '123456789', 'https://vimeo.com/123456789'],
  ],
}

describe('extractBlossomHash', () => {
  it('should extract hash and extension from valid Blossom URL', () => {
    const url =
      'https://almond.slidestr.net/0d1991b81fae8148cebdedbd4658c5d0873871620c248f1df60dda5b24e0999e.mp4'
    const result = extractBlossomHash(url)

    expect(result.sha256).toBe('0d1991b81fae8148cebdedbd4658c5d0873871620c248f1df60dda5b24e0999e')
    expect(result.ext).toBe('mp4')
  })

  it('should extract hash and extension from another valid Blossom URL', () => {
    const url =
      'https://blossom.primal.net/cf5a5ff1dddc3b97d8938f33d1088c9e5babcdc3f94c5178112392e9b3a36d27.mp4'
    const result = extractBlossomHash(url)

    expect(result.sha256).toBe('cf5a5ff1dddc3b97d8938f33d1088c9e5babcdc3f94c5178112392e9b3a36d27')
    expect(result.ext).toBe('mp4')
  })

  it('should handle URLs with .webp extension', () => {
    const url =
      'https://nostr.download/thumb/f6551d07b3ad65b6137780a68b5492ea541182fc16717d21b18cedfb8d6ef4d0.webp'
    const result = extractBlossomHash(url)

    expect(result.sha256).toBe('f6551d07b3ad65b6137780a68b5492ea541182fc16717d21b18cedfb8d6ef4d0')
    expect(result.ext).toBe('webp')
  })

  it('should return empty object for non-Blossom URL', () => {
    const url = 'https://v.nostr.build/RIbToHsVig5gjGLf.mp4'
    const result = extractBlossomHash(url)

    expect(result.sha256).toBeUndefined()
    expect(result.ext).toBeUndefined()
  })

  it('should return empty object for invalid URL', () => {
    const url = 'not-a-valid-url'
    const result = extractBlossomHash(url)

    expect(result.sha256).toBeUndefined()
    expect(result.ext).toBeUndefined()
  })

  it('should handle URLs with paths containing multiple segments', () => {
    const url =
      'https://example.com/path/to/a3a9cb9757f48dd7279cdd0473934ee1799f3a3e969b391f6e16d746b0c43057.png'
    const result = extractBlossomHash(url)

    expect(result.sha256).toBe('a3a9cb9757f48dd7279cdd0473934ee1799f3a3e969b391f6e16d746b0c43057')
    expect(result.ext).toBe('png')
  })
})

describe('processEvent', () => {
  const defaultRelays = ['wss://relay.example.com']

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('imeta tag events (kind 21, 22)', () => {
    it('should process zap.stream event with imeta tag', () => {
      const result = processEvent(zapStreamEvent, defaultRelays)

      expect(result).toBeDefined()
      expect(result?.id).toBe(zapStreamEvent.id)
      expect(result?.kind).toBe(21)
      expect(result?.title).toBe('Left Unknown - Strange Love')
      expect(result?.description).toBe('')
      expect(result?.pubkey).toBe(zapStreamEvent.pubkey)
      expect(result?.created_at).toBe(zapStreamEvent.created_at)
      // Duration is stored in imeta tag, not as separate tag, so separate duration tag lookup returns 0
      expect(result?.duration).toBe(0)
      expect(result?.mimeType).toBe('video/mp4; codecs="avc1"')
      expect(result?.x).toBe('f6551d07b3ad65b6137780a68b5492ea541182fc16717d21b18cedfb8d6ef4d0')
      expect(result?.urls).toContain(
        'https://nostr.download/f6551d07b3ad65b6137780a68b5492ea541182fc16717d21b18cedfb8d6ef4d0.mp4'
      )
      expect(result?.images).toContain(
        'https://nostr.download/2effc7a4cc306245f28766587e3a3036585cf531fb3dfb1c6d47438b1fb6529b.webp'
      )
      expect(result?.type).toBe('horizontal')
      expect(result?.tags).toEqual([])
    })

    it('should process nostube event with multiple images and fallback URLs', () => {
      const result = processEvent(nostubeEvent, defaultRelays)

      expect(result).toBeDefined()
      expect(result?.id).toBe(nostubeEvent.id)
      expect(result?.kind).toBe(21)
      expect(result?.title).toBe('nostube logo')
      expect(result?.description).toBe('Animated nostube logo')
      expect(result?.duration).toBe(4)
      expect(result?.mimeType).toBe('video/mp4; codecs="hvc1.2.4.L120.b0,mp4a.40.2"')
      expect(result?.x).toBe('0d1991b81fae8148cebdedbd4658c5d0873871620c248f1df60dda5b24e0999e')

      // Should have main URL and fallback URL
      expect(result?.urls).toHaveLength(2)
      expect(result?.urls).toContain(
        'https://almond.slidestr.net/0d1991b81fae8148cebdedbd4658c5d0873871620c248f1df60dda5b24e0999e.mp4'
      )
      expect(result?.urls).toContain(
        'https://blossom.primal.net/0d1991b81fae8148cebdedbd4658c5d0873871620c248f1df60dda5b24e0999e.mp4'
      )

      // Should have both image URLs
      expect(result?.images).toHaveLength(2)
      expect(result?.images).toContain(
        'https://almond.slidestr.net/a3a9cb9757f48dd7279cdd0473934ee1799f3a3e969b391f6e16d746b0c43057.png'
      )
      expect(result?.images).toContain(
        'https://blossom.primal.net/a3a9cb9757f48dd7279cdd0473934ee1799f3a3e969b391f6e16d746b0c43057.png'
      )
    })

    it('should process nostr.build event without alt tag', () => {
      const result = processEvent(nostrBuildEvent, defaultRelays)

      expect(result).toBeDefined()
      expect(result?.title).toBe('screen-20251112-165044.mp4')
      expect(result?.description).toBe(
        'Highlights and Twitter posts on #Jumble Imwald 🌲 RSS feed.'
      )
      expect(result?.mimeType).toBe('video/mp4')
      expect(result?.urls).toContain('https://v.nostr.build/RIbToHsVig5gjGLf.mp4')
      expect(result?.tags).toContain('#jumble')
    })

    it('should process vertical video event (kind 22)', () => {
      const result = processEvent(verticalVideoEvent, defaultRelays)

      expect(result).toBeDefined()
      expect(result?.kind).toBe(22)
      expect(result?.title).toBe('Vertical Video') // Uses alt tag when title is empty
      expect(result?.description).toBe('Marin 💕✨\nOriginally published in: 2025-11-13')
      expect(result?.type).toBe('vertical')
      expect(result?.x).toBe('cf5a5ff1dddc3b97d8938f33d1088c9e5babcdc3f94c5178112392e9b3a36d27')
      expect(result?.urls).toContain(
        'https://blossom.primal.net/cf5a5ff1dddc3b97d8938f33d1088c9e5babcdc3f94c5178112392e9b3a36d27.mp4'
      )
    })

    it('should use content as fallback when title and alt are missing', () => {
      const eventWithoutTitleOrAlt = {
        ...zapStreamEvent,
        content: 'This is the content',
        tags: zapStreamEvent.tags.filter(t => t[0] !== 'title'),
      }

      const result = processEvent(eventWithoutTitleOrAlt, defaultRelays)

      expect(result?.title).toBe('This is the content')
    })

    it('should handle blurhash for images', () => {
      const result = processEvent(verticalVideoEvent, defaultRelays)

      expect(result).toBeDefined()
      // Image should come from imeta tag, not blurhash
      expect(result?.images[0]).toBe(
        'https://blossom.primal.net/cf5a5ff1dddc3b97d8938f33d1088c9e5babcdc3f94c5178112392e9b3a36d27.mp4'
      )
    })

    it('should extract tags from event', () => {
      const eventWithTags = {
        ...nostubeEvent,
        tags: [...nostubeEvent.tags, ['t', 'nostr'], ['t', 'video']],
      }

      const result = processEvent(eventWithTags, defaultRelays)

      expect(result?.tags).toContain('nostr')
      expect(result?.tags).toContain('video')
    })

    it('should handle content-warning tag', () => {
      const eventWithWarning = {
        ...nostubeEvent,
        tags: [...nostubeEvent.tags, ['content-warning', 'NSFW']],
      }

      const result = processEvent(eventWithWarning, defaultRelays)

      expect(result?.contentWarning).toBe('NSFW')
    })

    it('should automatically mark videos from NSFW authors as NSFW', () => {
      const nsfwPubkey = 'e7fa9dd5b19fb96ff882456e99dd32e2fd59937409e398b75efc65a5131a2400'
      const nsfwAuthorEvent = {
        ...nostubeEvent,
        pubkey: nsfwPubkey,
      }

      const result = processEvent(nsfwAuthorEvent, defaultRelays, undefined, [nsfwPubkey])

      expect(result?.contentWarning).toBe('NSFW')
    })

    it('should mark videos from second NSFW author as NSFW', () => {
      const nsfwPubkey = 'f8f6b6f741bd422346579304550de64a6445fd332c50389e9a1f4d8294a101e0'
      const nsfwAuthorEvent = {
        ...nostubeEvent,
        pubkey: nsfwPubkey,
      }

      const result = processEvent(nsfwAuthorEvent, defaultRelays, undefined, [nsfwPubkey])

      expect(result?.contentWarning).toBe('NSFW')
    })

    it('should mark videos from third NSFW author as NSFW', () => {
      const nsfwPubkey = '0c9fb0a86f622b23e7802fbccf3c676cd4562ba267df4b3048f7dc77e9124a90'
      const nsfwAuthorEvent = {
        ...nostubeEvent,
        pubkey: nsfwPubkey,
      }

      const result = processEvent(nsfwAuthorEvent, defaultRelays, undefined, [nsfwPubkey])

      expect(result?.contentWarning).toBe('NSFW')
    })

    it('should preserve existing content-warning tag for NSFW authors', () => {
      const nsfwPubkey = 'e7fa9dd5b19fb96ff882456e99dd32e2fd59937409e398b75efc65a5131a2400'
      const nsfwAuthorWithWarning = {
        ...nostubeEvent,
        pubkey: nsfwPubkey,
        tags: [...nostubeEvent.tags, ['content-warning', 'Custom Warning']],
      }

      const result = processEvent(nsfwAuthorWithWarning, defaultRelays, undefined, [nsfwPubkey])

      expect(result?.contentWarning).toBe('Custom Warning')
    })

    it('should not mark videos from non-NSFW authors', () => {
      const nsfwPubkeys = ['e7fa9dd5b19fb96ff882456e99dd32e2fd59937409e398b75efc65a5131a2400']
      const normalEvent = {
        ...nostubeEvent,
        pubkey: 'b7c6f6915cfa9a62fff6a1f02604de88c23c6c6c6d1b8f62c7cc10749f307e81', // Normal author
      }

      const result = processEvent(normalEvent, defaultRelays, undefined, nsfwPubkeys)

      expect(result?.contentWarning).toBeUndefined()
    })

    it('should create search index from title, description, and tags', () => {
      const eventWithTags = {
        ...nostubeEvent,
        tags: [...nostubeEvent.tags, ['t', 'animation'], ['t', 'logo']],
      }

      const result = processEvent(eventWithTags, defaultRelays)

      expect(result?.searchText).toContain('nostube logo')
      expect(result?.searchText).toContain('animated nostube logo')
      expect(result?.searchText).toContain('animation')
      expect(result?.searchText).toContain('logo')
      // Search text should be lowercase
      expect(result?.searchText).toBe(result?.searchText.toLowerCase())
    })
  })

  describe('addressable events (kind 34235, 34236)', () => {
    it('should process yakihonne horizontal video with imeta tag and extract d tag', () => {
      const result = processEvent(yakihonneHorizontalEvent, defaultRelays)

      expect(result).toBeDefined()
      expect(result?.id).toBe(yakihonneHorizontalEvent.id)
      expect(result?.kind).toBe(34235)
      expect(result?.title).toBe('The Roof Thatching Train Never Stops')
      expect(result?.description).toContain('Reed in. Reed out')
      expect(result?.identifier).toBe('YG0jA04d_aH5HUYUoBT-q') // d tag should be extracted for addressable events
      expect(result?.mimeType).toBe('video/mp4')
      expect(result?.duration).toBe(0)
      expect(result?.urls).toContain('https://518.kiwi/wp-content/uploads/2025/11/Loading-Reed.mp4')
      expect(result?.images).toContain(
        'https://518.kiwi/wp-content/uploads/2025/11/Water-Reed-in-Barn-Boglander.jpg'
      )
      expect(result?.tags).toEqual(['thatching', 'bitcoin', 'crafts'])
      expect(result?.type).toBe('horizontal')
    })

    it('should process old format event without imeta tag', () => {
      const result = processEvent(oldFormatEvent, defaultRelays)

      expect(result).toBeDefined()
      expect(result?.id).toBe(oldFormatEvent.id)
      expect(result?.kind).toBe(34235)
      expect(result?.title).toBe('Flash your TollGate')
      expect(result?.description).toContain('Release Explorer')
      expect(result?.identifier).toBe(
        'ee4ec8d9eb9692dabbd4ed1b0bce3c101d70780b94c28a99fb9f4adfdee26921'
      )
      expect(result?.mimeType).toBe('video/mp4')
      expect(result?.size).toBe(478688107)
      expect(result?.urls).toContain(
        'https://blossom.primal.net/ee4ec8d9eb9692dabbd4ed1b0bce3c101d70780b94c28a99fb9f4adfdee26921.mp4'
      )
    })

    it('should process vertical addressable event (kind 34236) and extract d tag', () => {
      const result = processEvent(verticalAddressableEvent, defaultRelays)

      expect(result).toBeDefined()
      expect(result?.kind).toBe(34236)
      expect(result?.type).toBe('vertical')
      expect(result?.title).toBe('Vertical Video')
      expect(result?.description).toBe('跳个舞 #美女 #东北甜妹 #可爱女人')
      expect(result?.x).toBe('8c06494baacec723004d62456b79a8c33a333778414b161afed0607de1f10878')
      expect(result?.identifier).toBe(
        '8c06494baacec723004d62456b79a8c33a333778414b161afed0607de1f10878'
      ) // d tag should be extracted
    })

    it('should process flare video event', () => {
      const result = processEvent(flareVideoEvent, defaultRelays)

      expect(result).toBeDefined()
      expect(result?.title).toBe('Igualdade - Jordan Peterson\n')
      expect(result?.identifier).toBe('xPm0W3f')
      expect(result?.urls).toContain(
        'https://1a-1791.com/video/s8/2/h/W/R/q/hWRqb.caa.1.mp4?u=0&b=0'
      )
      expect(result?.tags).toEqual(['Jordan', 'Peterson', 'igualdade'])
    })

    it('should use url tag as image fallback when thumb is not present', () => {
      const eventWithoutThumb = {
        ...oldFormatEvent,
        tags: oldFormatEvent.tags.filter(t => t[0] !== 'thumb'),
      }

      const result = processEvent(eventWithoutThumb, defaultRelays)

      expect(result?.images[0]).toBe(
        'https://blossom.primal.net/ee4ec8d9eb9692dabbd4ed1b0bce3c101d70780b94c28a99fb9f4adfdee26921.mp4'
      )
    })

    it('should generate naddr link for addressable horizontal video (kind 34235)', () => {
      const result = processEvent(yakihonneHorizontalEvent, defaultRelays)

      expect(result).toBeDefined()
      expect(result?.link).toMatch(/^naddr1/)
      // Verify it's a valid naddr by checking it contains the identifier
      expect(result?.link).toContain('YG0jA04d_aH5HUYUoBT-q')
    })

    it('should generate naddr link for addressable vertical video (kind 34236)', () => {
      const result = processEvent(verticalAddressableEvent, defaultRelays)

      expect(result).toBeDefined()
      expect(result?.link).toMatch(/^naddr1/)
    })

    it('should generate naddr link for old format addressable event', () => {
      const result = processEvent(oldFormatEvent, defaultRelays)

      expect(result).toBeDefined()
      expect(result?.link).toMatch(/^naddr1/)
    })
  })

  describe('origin tag support', () => {
    it('should extract origin tag from imeta format event', () => {
      const result = processEvent(eventWithOriginTag, defaultRelays)

      expect(result).toBeDefined()
      expect(result?.origin).toBeDefined()
      expect(result?.origin?.platform).toBe('youtube')
      expect(result?.origin?.externalId).toBe('dQw4w9WgXcQ')
      expect(result?.origin?.originalUrl).toBe('https://youtube.com/watch?v=dQw4w9WgXcQ')
      expect(result?.origin?.metadata).toBe('uploaded:2020-01-01')
    })

    it('should extract origin tag from old format event', () => {
      const result = processEvent(eventWithOriginOldFormat, defaultRelays)

      expect(result).toBeDefined()
      expect(result?.origin).toBeDefined()
      expect(result?.origin?.platform).toBe('vimeo')
      expect(result?.origin?.externalId).toBe('123456789')
      expect(result?.origin?.originalUrl).toBe('https://vimeo.com/123456789')
      expect(result?.origin?.metadata).toBeUndefined() // optional metadata not provided
    })

    it('should handle origin tag with minimal fields', () => {
      const minimalOriginEvent = {
        ...eventWithOriginTag,
        tags: [
          ['d', 'minimal-origin'],
          ['imeta', 'url https://example.com/video.mp4', 'm video/mp4'],
          ['title', 'Minimal Origin'],
          ['origin', 'platform', 'id123'], // Only platform and externalId
        ],
      }

      const result = processEvent(minimalOriginEvent, defaultRelays)

      expect(result?.origin).toBeDefined()
      expect(result?.origin?.platform).toBe('platform')
      expect(result?.origin?.externalId).toBe('id123')
      expect(result?.origin?.originalUrl).toBeUndefined()
      expect(result?.origin?.metadata).toBeUndefined()
    })

    it('should handle events without origin tag', () => {
      const result = processEvent(zapStreamEvent, defaultRelays)

      expect(result).toBeDefined()
      expect(result?.origin).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('should handle URL with spaces in old format', () => {
      // Old format (without imeta) trims spaces from URLs
      const eventWithSpaceInUrl = {
        ...oldFormatEvent,
        tags: [
          ['url', 'https://example.com/video.mp4 extra content'],
          ['title', 'Test Video'],
          ['m', 'video/mp4'],
        ],
      }

      const result = processEvent(eventWithSpaceInUrl, defaultRelays)

      // Old format code (line 230-233) splits on space
      expect(result?.urls[0]).toBe('https://example.com/video.mp4')
    })

    it('should handle missing duration tag', () => {
      const eventWithoutDuration = {
        ...zapStreamEvent,
        tags: zapStreamEvent.tags.filter(t => t[0] !== 'duration'),
      }

      const result = processEvent(eventWithoutDuration, defaultRelays)

      expect(result?.duration).toBe(0)
    })

    it('should handle event with no tags', () => {
      const eventWithNoTags = {
        ...nostubeEvent,
        tags: nostubeEvent.tags.filter(t => t[0] === 'imeta'),
      }

      const result = processEvent(eventWithNoTags, defaultRelays)

      expect(result?.tags).toEqual([])
      expect(result?.duration).toBe(0)
    })

    it('should generate nevent link with correct parameters including author pubkey', () => {
      const result = processEvent(zapStreamEvent, defaultRelays)

      expect(result?.link).toBe(`nevent1${zapStreamEvent.id}-${zapStreamEvent.pubkey}`)
    })

    it('should handle missing mime type', () => {
      const eventWithoutMime = {
        ...zapStreamEvent,
        tags: [
          ['imeta', 'url https://example.com/video.mp4'],
          ['title', 'Test Video'],
        ],
      }

      const result = processEvent(eventWithoutMime, defaultRelays)

      expect(result?.mimeType).toBeUndefined()
    })
  })
})

describe('processEvents', () => {
  const defaultRelays = ['wss://relay.example.com']

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should process multiple events and return VideoEvent array', () => {
    const events = [zapStreamEvent, nostubeEvent, nostrBuildEvent]
    const results = processEvents(events, defaultRelays)

    expect(results).toHaveLength(3)
    expect(results[0].id).toBe(zapStreamEvent.id)
    expect(results[1].id).toBe(nostubeEvent.id)
    expect(results[2].id).toBe(nostrBuildEvent.id)
  })

  it('should filter out undefined events', () => {
    const events = [zapStreamEvent, undefined, nostubeEvent, undefined]
    const results = processEvents(events, defaultRelays)

    expect(results).toHaveLength(2)
    expect(results[0].id).toBe(zapStreamEvent.id)
    expect(results[1].id).toBe(nostubeEvent.id)
  })

  it('should process events with empty URL as empty string', () => {
    // Events without imeta or url tags fall back to old format with empty URL
    const eventWithNoUrl = {
      ...zapStreamEvent,
      tags: [['title', 'No URL']],
    }

    const results = processEvents([eventWithNoUrl], defaultRelays)

    // processEvent returns VideoEvent with urls: [''], which passes the filter
    // since Boolean(['']) is true and ''?.indexOf('youtube.com') returns -1 (< 0)
    expect(results).toHaveLength(1)
    expect(results[0].urls).toEqual([''])
  })

  it('should filter out YouTube URLs', () => {
    const youtubeEvent = {
      ...zapStreamEvent,
      tags: [
        ['imeta', 'url https://youtube.com/watch?v=123', 'm video/mp4'],
        ['title', 'YouTube Video'],
      ],
    }

    const results = processEvents([youtubeEvent], defaultRelays)

    expect(results).toHaveLength(0)
  })

  it('should filter out blocked pubkeys', () => {
    const blockPubkeys = {
      [zapStreamEvent.pubkey]: true,
    }

    const results = processEvents([zapStreamEvent, nostubeEvent], defaultRelays, blockPubkeys)

    expect(results).toHaveLength(1)
    expect(results[0].id).toBe(nostubeEvent.id)
  })

  it('should filter out missing video IDs', () => {
    const missingVideoIds = new Set([zapStreamEvent.id])

    const results = processEvents(
      [zapStreamEvent, nostubeEvent],
      defaultRelays,
      undefined,
      undefined,
      missingVideoIds
    )

    expect(results).toHaveLength(1)
    expect(results[0].id).toBe(nostubeEvent.id)
  })

  it('should pass blossom servers to processEvent', () => {
    const blossomServers: BlossomServer[] = [
      { url: 'https://blossom.example.com', name: 'Example Blossom', tags: ['mirror'] },
    ]

    const results = processEvents([nostubeEvent], defaultRelays, undefined, blossomServers)

    expect(results).toHaveLength(1)
    expect(results[0].id).toBe(nostubeEvent.id)
  })

  it('should handle empty events array', () => {
    const results = processEvents([], defaultRelays)

    expect(results).toHaveLength(0)
  })

  it('should process mix of kind 21, 22, 34235, and 34236 events', () => {
    const events = [
      zapStreamEvent, // kind 21
      verticalVideoEvent, // kind 22
      yakihonneHorizontalEvent, // kind 34235
      verticalAddressableEvent, // kind 34236
    ]

    const results = processEvents(events, defaultRelays)

    expect(results).toHaveLength(4)
    expect(results[0].type).toBe('horizontal')
    expect(results[1].type).toBe('vertical')
    expect(results[2].type).toBe('horizontal')
    expect(results[3].type).toBe('vertical')
  })

  it('should apply all filters together', () => {
    const blockPubkeys = {
      [zapStreamEvent.pubkey]: true,
    }
    const missingVideoIds = new Set([nostubeEvent.id])

    const events = [
      zapStreamEvent, // blocked by pubkey
      nostubeEvent, // blocked by missing ID
      verticalVideoEvent, // should pass
      undefined, // filtered as undefined
    ]

    const results = processEvents(events, defaultRelays, blockPubkeys, undefined, missingVideoIds)

    expect(results).toHaveLength(1)
    expect(results[0].id).toBe(verticalVideoEvent.id)
  })
})
