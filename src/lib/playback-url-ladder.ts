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

export interface PlaybackUrlLadderOptions {
  urls: string[]
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
  private readonly failed = new Set<string>()

  constructor(options: PlaybackUrlLadderOptions) {
    this.options = options
    const generated = this.generate(options.urls, options.sha256)
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

  get failedUrls(): string[] {
    return [...this.failed]
  }

  isFailed(url: string): boolean {
    return this.failed.has(url)
  }

  /** Report the active candidate as failed and advance to the next unfailed candidate. */
  tryNext(): boolean {
    const current = this.currentUrl
    if (current) this.failed.add(current)
    return this.advance()
  }

  /**
   * Record a failed candidate from the player or HLS loader. A failure advances
   * only when it belongs to the active URL; segment failures remain available
   * to the requesting loader through {@link candidatesFor}.
   */
  onError(url = this.currentUrl ?? undefined, _kind?: PlaybackErrorKind): boolean {
    if (!url) return false
    const isCurrent = url === this.currentUrl
    this.failed.add(url)
    return isCurrent ? this.advance() : false
  }

  /** Start again at the first candidate that has not already failed. */
  reset(): void {
    const first = this.findNextIndex(0)
    this._index = first === -1 ? this._urls.length : first
  }

  /**
   * Re-apply the shared generation policy when the configuration changes. New
   * candidates append without disrupting the active candidate or failed set.
   */
  refresh(options: PlaybackUrlLadderOptions): boolean {
    this.options = options
    const generated = this.generate(options.urls, options.sha256)
    return this.appendNew(generated.urls, index => generated.metadata[index])
  }

  /** Merge asynchronous discovery candidates after the generated candidates. */
  merge(urls: string[], source: UrlSource = 'discovered'): boolean {
    return this.appendNew(urls, () => ({ source }))
  }

  /** Promote known-good candidates while preserving the current URL. */
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
  }

  /**
   * Generate fallback candidates for a manifest or segment through the same
   * policy and remove candidates already known to have failed.
   */
  candidatesFor(url: string): string[] {
    const { sha256 } = extractBlossomHash(url)
    const candidates = sha256 ? this.generate([url], sha256).urls : [url]
    return candidates.filter(candidate => !this.failed.has(candidate))
  }

  private generate(urls: string[], sha256?: string): GeneratedUrls {
    if (urls.length === 0) return { urls: [], metadata: [] }

    return generateMediaUrls({
      urls,
      blossomServers: this.options.blossomServers,
      cachingServers: this.options.cachingServers,
      sha256,
      kind: this.options.kind,
      mediaType: this.options.mediaType,
      authorPubkey: this.options.authorPubkey,
      proxyConfig: this.options.proxyConfig,
    })
  }

  private advance(): boolean {
    const next = this.findNextIndex(this._index + 1)
    if (next === -1) return false
    this._index = next
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
}
