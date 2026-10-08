export interface UserLevel {
  name: string
  colorClass: string
  bgClass: string
  minScore: number
}

export const USER_LEVELS: UserLevel[] = [
  { name: 'Grandmaster', colorClass: 'text-purple-500', bgClass: 'bg-purple-500', minScore: 0.9 },
  { name: 'Master', colorClass: 'text-amber-500', bgClass: 'bg-amber-500', minScore: 0.75 },
  { name: 'Adept', colorClass: 'text-blue-500', bgClass: 'bg-blue-500', minScore: 0.5 },
  { name: 'Apprentice', colorClass: 'text-green-500', bgClass: 'bg-green-500', minScore: 0.2 },
  {
    name: 'Novice',
    colorClass: 'text-muted-foreground',
    bgClass: 'bg-muted-foreground',
    minScore: 0,
  },
]

/**
 * Color mapping for personalized trust scores (badge + dialog header).
 * Separate from getUserLevel which is for the global NosTube user level only.
 */
export function getTrustColor(score: number): {
  label: string
  labelKey: string
  colorClass: string
  bgClass: string
} {
  if (score >= 0.7)
    return {
      label: 'High',
      labelKey: 'trust.labels.high',
      colorClass: 'text-green-500',
      bgClass: 'bg-green-500',
    }
  if (score >= 0.4)
    return {
      label: 'Medium',
      labelKey: 'trust.labels.medium',
      colorClass: 'text-yellow-500',
      bgClass: 'bg-yellow-500',
    }
  return {
    label: 'Low',
    labelKey: 'trust.labels.low',
    colorClass: 'text-red-500',
    bgClass: 'bg-red-500',
  }
}

export function getUserLevel(score: number): UserLevel {
  return USER_LEVELS.find(l => score >= l.minScore) ?? USER_LEVELS[USER_LEVELS.length - 1]
}
