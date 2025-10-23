import { useProfile } from './useProfile'

export function useAuthor(pubkey: string) {
  return useProfile({ pubkey })
}
