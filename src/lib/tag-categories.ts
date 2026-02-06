export interface TagCategory {
  name: string // Display name
  slug: string // URL-safe slug
  tags: string[] // Normalized lowercase tags
}

export const TAG_CATEGORIES: TagCategory[] = [
  {
    name: 'Bitcoin',
    slug: 'bitcoin',
    tags: [
      'bitcoin',
      'btc',
      'cryptocurrency',
      'titcoin',
      'crypto',
      'proof of work',
      'lightning',
      'fiat',
      'rhr',
      'rabbitholerecap',
    ],
  },
  {
    name: 'Nostr',
    slug: 'nostr',
    tags: ['nostr'],
  },
  {
    name: 'Music',
    slug: 'music',
    tags: [
      'bts',
      'exo',
      'blackpink',
      'shinee',
      'twice',
      'jungkook',
      'sehun',
      'music videos',
      'music',
      'hip hop',
      'country',
      'alternative',
      'jazz',
      'electronica',
      'techno',
      'dance',
      'tunestr',
      'versusmedia',
    ],
  },
  {
    name: 'Social Media',
    slug: 'social-media',
    tags: [
      'fyp',
      'reels2024',
      'reels',
      'vine',
      'viral',
      'trending',
      'trendingreels',
      'explorepage',
      'explore',
      'foryou',
      'ripvine',
      'vinealo',
      'olas365',
      'olas',
    ],
  },
  {
    name: 'Entertainment',
    slug: 'entertainment',
    tags: [
      'comedy',
      'funny',
      'memes',
      'meme',
      'animation',
      'anime',
      'foamy',
      'cartoon',
      'lol',
      'film',
      'movie',
      'kinostr',
    ],
  },
  {
    name: 'Technology & Innovation',
    slug: 'technology-and-innovation',
    tags: [
      'technology',
      'artificial intelligence',
      'ai',
      'tech',
      'privacy',
      'decentralization',
      'open source',
    ],
  },
  {
    name: 'Photography & Art',
    slug: 'photography-and-art',
    tags: [
      'photography',
      'art',
      'artstr',
      'photostr',
      'cosplay',
      'cosplayer',
      'beauty',
      'fashion',
      'craft',
    ],
  },
  {
    name: 'Politics & Economics',
    slug: 'politics-and-economics',
    tags: [
      'politics',
      'economics',
      'freedom',
      'austrianeconomics',
      'capitalism',
      'socialism',
      'government',
      'mises',
    ],
  },
  {
    name: 'Travel & Nature',
    slug: 'travel-and-nature',
    tags: ['travel', 'brasil', 'brazil', 'nature', 'thailand', 'tokyo', 'sunset', 'beach', 'asia'],
  },
]

/**
 * Generate URL-safe slug from category name
 * "Technology & Innovation" -> "technology-and-innovation"
 */
export function generateCategorySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*&\s*/g, '-and-')
    .replace(/\s+/g, '-')
}

/**
 * Find category by slug
 */
export function getCategoryBySlug(slug: string): TagCategory | undefined {
  return TAG_CATEGORIES.find(cat => cat.slug === slug)
}

/**
 * Get all category names for display
 */
export function getAllCategoryNames(): string[] {
  return TAG_CATEGORIES.map(cat => cat.name)
}
