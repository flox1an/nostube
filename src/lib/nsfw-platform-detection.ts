const NSFW_PLATFORM_TRIGGERS: readonly string[] = ['xhamster']

export function hasNsfwPlatformAttributes(tags: string[][]): boolean {
  return tags.some(([name, value]) => {
    if (typeof value !== 'string') return false

    const normalizedValue = value.trim().toLowerCase()

    if (name === 'd') {
      return NSFW_PLATFORM_TRIGGERS.some(trigger => normalizedValue.startsWith(trigger))
    }

    if (name === 'source') {
      return NSFW_PLATFORM_TRIGGERS.includes(normalizedValue)
    }

    return false
  })
}

export function getExplicitContentWarning(tags: string[][]): string | undefined {
  const contentWarning = tags.find(([name]) => name === 'content-warning')?.[1]
  return contentWarning?.trim() ? contentWarning : undefined
}
