import { describe, expect, it } from 'vitest'
import { MOBILE_CHAT_APPEARANCE, normalizeChatAppearance } from './chat-appearance'

describe('normalizeChatAppearance', () => {
  it('fills unset fields from the device defaults and keeps the viewer’s choices', () => {
    expect(normalizeChatAppearance({}, MOBILE_CHAT_APPEARANCE)).toEqual(MOBILE_CHAT_APPEARANCE)
    const chosen = normalizeChatAppearance(
      { fontSize: 12, showTrust: true },
      MOBILE_CHAT_APPEARANCE
    )
    expect(chosen).toMatchObject({ fontSize: 12, showTrust: true, hideMuted: true })
  })
})
