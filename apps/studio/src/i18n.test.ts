import { describe, expect, it } from 'vitest'
import i18n from './i18n'

describe('studio translations', () => {
  it('follows a supported browser language and falls back to English', async () => {
    await i18n.changeLanguage('de-AT')
    expect(i18n.resolvedLanguage).toBe('de')
    expect(document.documentElement.lang).toBe('de')
    await i18n.changeLanguage('pt-BR')
    expect(i18n.resolvedLanguage).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })
  it('provides video lifecycle actions and errors in every Studio locale', () => {
    const keys = [
      'edit',
      'replace',
      'replaceHint',
      'delete',
      'deleteConfirm',
      'deleteHint',
      'confirmDelete',
      'deleting',
      'cancel',
      'save',
      'saving',
      'authorMismatch',
      'notAddressable',
      'eventMissing',
      'assetMissing',
    ]
    for (const language of ['en', 'de', 'fr', 'es', 'ru', 'zh', 'ja']) {
      for (const key of keys) {
        expect(i18n.getResource(language, 'translation', `studio.videos.${key}`)).toBeTypeOf(
          'string'
        )
      }
    }
  })
  it('provides scheduled publishing texts in every Studio locale', () => {
    const keys = [
      'studio.upload.publishAt',
      'studio.upload.publishAtHint',
      'studio.upload.publishAtPast',
      'studio.upload.schedule',
      'studio.upload.scheduledTitle',
      'studio.upload.scheduledDescription',
      'studio.videos.scheduled.title',
      'studio.videos.scheduled.edit',
      'studio.videos.scheduled.cancelPublication',
      'studio.videos.scheduled.cancelConfirm',
      'studio.videos.scheduled.cancelHint',
      'studio.videos.scheduled.confirmCancel',
      'studio.videos.scheduled.keep',
      'studio.videos.scheduled.state.scheduled',
      'studio.videos.scheduled.state.released',
      'studio.videos.scheduled.state.failed',
    ]
    for (const language of ['en', 'de', 'fr', 'es', 'ru', 'zh', 'ja']) {
      for (const key of keys) {
        expect(i18n.getResource(language, 'translation', key)).toBeTypeOf('string')
      }
    }
  })
})
