/**
 * The embed page is shared with nostu.be, whose static head names nostube. On an instance the embed
 * is part of the creator's website, so the head says what it is: a video player.
 */
export function neutralizeBranding(doc: Document = document) {
  doc.title = 'Video player'
  const set = (selector: string, value: string) =>
    doc.querySelector(selector)?.setAttribute('content', value)
  set('meta[name="description"]', 'An embeddable video player')
  set('meta[property="og:title"]', 'Video player')
  set('meta[property="og:description"]', 'An embeddable video player')
}
