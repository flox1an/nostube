export type RecommendationVideo = {
  id: string
  kind: number
  identifier?: string
  pubkey: string
  title: string
  images: string[]
  urls: string[]
  duration: number
  created_at: number
  published_at?: number
  link: string
  type: 'videos' | 'shorts'
  mediaType?: 'video' | 'audio'
  contentWarning: string | null
  thumbnailVariants: Array<{
    url: string
    fallbackUrls: string[]
    mediaType: 'image'
    blurhash?: string
  }>
  recommendationScore: number
}
