import './i18n'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SITE_LINKS, noSitePages } from '@nostube/core/instance-config'
import type { Draft } from './draft'
import { PagesPage } from './PagesPage'

const draft = (pages = noSitePages()) =>
  ({ links: DEFAULT_SITE_LINKS, profileRelaysText: '', pages }) as unknown as Draft

describe('PagesPage', () => {
  it('edits one language of one page and leaves the others as they were', () => {
    const update = vi.fn()
    render(
      <PagesPage
        draft={draft({ ...noSitePages(), imprint: { en: 'Imprint', de: 'Impressum' } })}
        update={update}
      />
    )
    // The editor opens on a language that already has a text.
    const imprint = screen.getAllByRole('textbox')[1] as HTMLTextAreaElement
    expect(imprint.value).toBe('Imprint')

    const languages = screen.getAllByRole('combobox')
    fireEvent.change(languages[1], { target: { value: 'de' } })
    expect((screen.getAllByRole('textbox')[1] as HTMLTextAreaElement).value).toBe('Impressum')

    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'Impressum neu' } })
    expect(update).toHaveBeenCalledWith({
      pages: { about: {}, imprint: { en: 'Imprint', de: 'Impressum neu' }, privacy: {} },
    })
  })

  it('marks the languages that have a text', () => {
    render(
      <PagesPage draft={draft({ ...noSitePages(), about: { fr: 'À propos' } })} update={vi.fn()} />
    )
    const options = [...screen.getAllByRole('combobox')[0].querySelectorAll('option')]
    expect(options.filter(o => o.textContent?.includes('✓')).map(o => o.value)).toEqual(['fr'])
  })

  describe('standard text', () => {
    const privacyDraft = (privacy: Record<string, string>, profileRelaysText = '') =>
      ({
        links: DEFAULT_SITE_LINKS,
        profileRelaysText,
        pages: { ...noSitePages(), privacy },
      }) as unknown as Draft
    const standardButton = () => screen.getByRole('button', { name: 'Insert the standard text' })

    it('is offered for the privacy policy only', () => {
      render(<PagesPage draft={draft()} update={vi.fn()} />)
      expect(screen.getAllByRole('button', { name: 'Insert the standard text' })).toHaveLength(1)
    })

    it('fills the current language, with the profile relays of the Advanced page', () => {
      const update = vi.fn()
      render(<PagesPage draft={privacyDraft({}, 'wss://profiles.example\n')} update={update} />)
      fireEvent.click(standardButton())
      const { privacy } = update.mock.calls[0][0].pages
      expect(Object.keys(privacy)).toEqual(['en'])
      expect(privacy.en).toContain('wss://profiles.example')
    })

    it('asks before it replaces a text that is there', () => {
      const update = vi.fn()
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
      render(<PagesPage draft={privacyDraft({ en: 'My own text' })} update={update} />)
      fireEvent.click(standardButton())
      expect(confirm).toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
      confirm.mockReturnValue(true)
      fireEvent.click(standardButton())
      expect(update.mock.calls[0][0].pages.privacy.en).not.toBe('My own text')
      confirm.mockRestore()
    })

    it('fills all empty languages and leaves a written one alone', () => {
      const update = vi.fn()
      render(<PagesPage draft={privacyDraft({ de: 'Mein Text' })} update={update} />)
      fireEvent.click(screen.getByRole('button', { name: 'Standard text for all empty languages' }))
      const { privacy } = update.mock.calls[0][0].pages
      expect(privacy.de).toBe('Mein Text')
      expect(Object.keys(privacy).sort()).toEqual(['de', 'en', 'es', 'fr', 'ja', 'ru', 'zh'])
    })
  })
})
