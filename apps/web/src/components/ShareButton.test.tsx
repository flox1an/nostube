import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import i18n from '@/i18n/config'
import ShareButton from '@nostube/widgets/components/ShareButton'

// The share dialog lives in @nostube/widgets; its strings come in through registerWidgetTranslations.
describe('ShareButton in nostube', () => {
  it.each([
    ['en', 'Share this video'],
    ['de', 'Dieses Video teilen'],
  ])('is labelled in %s with the widget translations', async (lng, label) => {
    await i18n.changeLanguage(lng)
    render(
      <ShareButton
        shareOpen={false}
        setShareOpen={() => {}}
        shareUrl="https://nostu.be/v/nevent1abc"
        shareLinks={{
          mailto: '',
          whatsapp: '',
          x: '',
          reddit: '',
          facebook: '',
          pinterest: '',
        }}
      />
    )
    expect(screen.getByRole('button', { name: label })).toBeTruthy()
  })
})
