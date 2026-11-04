import { expect, it } from 'vitest'
import { DEFAULT_PRESET_PUBKEY, getPresetPubkey } from './preset'

const ADMIN = '7e3decf0396b7b2e35fe26bbf46306f19a3ae34f73726f306f45390c96dd0c94'
const OLD_PERSONAL = 'b7c6f6915cfa9a62fff6a1f02604de88c23c6c6c6d1b8f62c7cc10749f307e81'
const ALTERNATE = 'a'.repeat(64)

it('defaults to the admin preset', () => {
  expect(DEFAULT_PRESET_PUBKEY).toBe(ADMIN)
  expect(getPresetPubkey(null)).toBe(ADMIN)
  expect(getPresetPubkey(undefined)).toBe(ADMIN)
  expect(getPresetPubkey()).toBe(ADMIN)
})

it('migrates the old personal default to admin', () => {
  expect(getPresetPubkey(OLD_PERSONAL)).toBe(ADMIN)
})

it('preserves an explicit alternate selection', () => {
  expect(getPresetPubkey(ALTERNATE)).toBe(ALTERNATE)
  expect(getPresetPubkey(ADMIN)).toBe(ADMIN)
})
