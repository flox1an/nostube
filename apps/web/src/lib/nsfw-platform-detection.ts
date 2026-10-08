const NSFW_IDENTIFIER_PREFIXES: readonly string[] = ['xhamster', 'porntubeai', 'pmvhaven']
const NSFW_CLIENTS: readonly string[] = ['porntubeai', 'pmvhaven']

export function hasNsfwPlatformAttributes(tags: string[][]): boolean {
  return tags.some(([name, value]) => {
    if (typeof value !== 'string') return false

    const normalizedValue = value.trim().toLowerCase()

    if (name === 'd') {
      return NSFW_IDENTIFIER_PREFIXES.some(trigger => normalizedValue.startsWith(trigger))
    }

    if (name === 'source') {
      return normalizedValue === 'xhamster'
    }

    if (name === 'client') {
      return NSFW_CLIENTS.includes(normalizedValue)
    }

    return false
  })
}

export function getExplicitContentWarning(tags: string[][]): string | undefined {
  const contentWarning = tags.find(([name]) => name === 'content-warning')?.[1]
  return contentWarning?.trim() ? contentWarning : undefined
}
