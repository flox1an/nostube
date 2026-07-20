import { describe, expect, it } from 'vitest'
import { filterPeopleSearchResults } from './useSearchVideoAuthors'

const nsfwPubkey = 'nsfw-pubkey'
const blockedPubkey = 'blocked-pubkey'
const safePubkey = 'safe-pubkey'
const profiles = [
  { pubkey: nsfwPubkey, name: 'NSFW creator' },
  { pubkey: blockedPubkey, name: 'Blocked creator' },
  { pubkey: safePubkey, name: 'Safe creator' },
]

describe('filterPeopleSearchResults', () => {
  it('hides known NSFW and blocked profiles when NSFW content is hidden', () => {
    expect(
      filterPeopleSearchResults(profiles, true, [nsfwPubkey], { [blockedPubkey]: true })
    ).toEqual([profiles[2]])
  })

  it('keeps known NSFW profiles but always removes blocked profiles', () => {
    expect(
      filterPeopleSearchResults(profiles, false, [nsfwPubkey], { [blockedPubkey]: true })
    ).toEqual([profiles[0], profiles[2]])
  })
})
