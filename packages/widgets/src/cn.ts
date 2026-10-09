import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Joins class names and resolves conflicting Tailwind utilities (later ones win). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
