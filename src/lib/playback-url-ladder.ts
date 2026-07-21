import type { BlossomServer, CachingServer } from '@/contexts/AppContext'
import { extractBlossomHash } from '@/lib/blossom-url'
import {
  generateMediaUrls,
  type GeneratedUrls,
  type MediaType,
  type MediaUrlOptions,
  type UrlMetadata,
  type UrlSource,
} from './media-url-generator'
import { filterCompatibleVariants } from './codec-compatibility'
import type { VideoVariant } from '@/utils/video-event'

export interface PlaybackUrlLadderOptions {
  urls: string[]
  variants?: VideoVariant[]
  blossomServers: BlossomServer[]
  cachingServers?: CachingServer[]
  sha256?: string
  kind?: number
  mediaType: MediaType
  authorPubkey?: string
  proxyConfig?: MediaUrlOptions['proxyConfig']
}

export type PlaybackErrorKind = 'manifest' | 'segment' | 'media' | 'network' | string

/**
 * The mutable URL selection policy for one Video Event.
 *
 * It stays independent of React and HLS.js: callers can retain one instance
 * across renders and report failed candidates from either playback path.
 */
export class PlaybackUrlLadder {
  private options: PlaybackUrlLadderOptions
  private _urls: string[]
  private _metadata: UrlMetadata[]
  private _index = 0
  private _error: Error | null = null
  private readonly failed = new Set<string>()
  private readonly listeners = new Set<() => void>()

  constructor(options: PlaybackUrlLadderOptions) {
    this.options = options
    const generated = this.generate(this.sourceUrls(options), options.sha256)
    this._urls = generated.urls
    this._metadata = generated.metadata
  }

  get urls(): string[] {
    return this._urls
  }

  get metadata(): UrlMetadata[] {
    return this._metadata
  }

  get currentIndex(): number {
    return this._index
  }

  get currentUrl(): string | null {
    return this._urls[this._index] ?? null
  }

  get hasMore(): boolean {
    return this.findNextIndex(this._index + 1) !== -1
  }

  get error(): Error | null {
    return this._error
  }

  get failedUrls(): string[] {
    return [...this.failed]
  }

  isFailed(url: string): boolean {
    return this.failed.has(url)
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  tryNext(): boolean {
    const current = this.currentUrl
    if (current) this.failed.add(current)
    return this.advance()
  }

  onError(url = this.currentUrl ?? undefined, _kind?: PlaybackErrorKind): boolean {
    if (!url) return false
    const isCurrent = url === this.currentUrl
    this.failed.add(url)
    const advanced = isCurrent ? this.advance() : false
    this.notify()
    return advanced
  }

  reset(): void {
    const first = this.findNextIndex(0)
    this._index = first === -1 ? this._urls.length : first
    this._error = null
    this.notify()
  }

  refresh(options: PlaybackUrlLadderOptions): boolean {
    this.options = options
    const generated = this.generate(this.sourceUrls(options), options.sha256)
    const changed = this.appendNew(generated.urls, index => generated.metadata[index])
    if (changed) this.notify()
    return changed
  }

  merge(urls: string[], source: UrlSource = 'discovered'): boolean {
    const changed = this.appendNew(urls, () => ({ source }))
    if (changed) this.notify()
    return changed
  }

  promote(urls: string[]): void {
    const current = this.currentUrl
    const promoted = new Set(urls.filter(url => this._urls.includes(url) && !this.failed.has(url)))
    if (promoted.size === 0) return

    const orderedIndexes = [
      ...this._urls.flatMap((url, index) => (promoted.has(url) ? [index] : [])),
      ...this._urls.flatMap((url, index) => (promoted.has(url) ? [] : [index])),
    ]
    this._urls = orderedIndexes.map(index => this._urls[index])
    this._metadata = orderedIndexes.map(index => this._metadata[index])
    this._index = current ? this._urls.indexOf(current) : this.findNextIndex(0)
    this.notify()
  }

  candidatesFor(url: string): string[] {
    const { sha256 } = extractBlossomHash(url)
    const candidates = sha256 ? this.generate([url], sha256).urls : [url]
    return candidates.filter(candidate => !this.failed.has(candidate))
  }

  private sourceUrls(options: PlaybackUrlLadderOptions): string[] {
    if (!options.variants) return options.urls
    return filterCompatibleVariants(options.variants).map(variant => variant.url)
  }

  private generate(urls: string[], sha256?: string): GeneratedUrls {
    if (urls.length === 0) return { urls: [], metadata: [] }

    try {
      const generated = generateMediaUrls({
        urls,
        blossomServers: this.options.blossomServers,
        cachingServers: this.options.cachingServers,
        sha256,
        kind: this.options.kind,
        mediaType: this.options.mediaType,
        authorPubkey: this.options.authorPubkey,
        proxyConfig: this.options.proxyConfig,
      })
      this._error = null
      return generated
    } catch (error) {
      this._error = error instanceof Error ? error : new Error('Media URL generation failed')
      return { urls: [], metadata: [] }
    }
  }

  private advance(): boolean {
    const next = this.findNextIndex(this._index + 1)
    if (next === -1) return false
    this._index = next
    this.notify()
    return true
  }

  private findNextIndex(start: number): number {
    for (let index = start; index < this._urls.length; index += 1) {
      if (!this.failed.has(this._urls[index])) return index
    }
    return -1
  }

  private appendNew(urls: string[], metadataFor: (index: number) => UrlMetadata): boolean {
    const known = new Set(this._urls)
    const newUrls: string[] = []
    const newMetadata: UrlMetadata[] = []

    urls.forEach((url, index) => {
      if (known.has(url)) return
      known.add(url)
      newUrls.push(url)
      newMetadata.push(metadataFor(index))
    })

    if (newUrls.length === 0) return false
    this._urls = [...this._urls, ...newUrls]
    this._metadata = [...this._metadata, ...newMetadata]
    return true
  }

  private notify(): void {
    this.listeners.forEach(listener => listener())
  }
}
