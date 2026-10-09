import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Shared helpers live in common-utils (React/CSS free); re-exported here for existing imports. */
export * from './common-utils'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
