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
  it('provides hosting, deletion and public mirror status texts in every Studio locale', () => {
    const keys = [
      'studio.nsite.title',
      'studio.nsite.description',
      'studio.nsite.managedRequired',
      'studio.nsite.publicRequired',
      'studio.nsite.instance',
      'studio.nsite.instanceBody',
      'studio.nsite.nsite',
      'studio.nsite.nsiteBody',
      'studio.nsite.gateway',
      'studio.nsite.gatewayHint',
      'studio.nsite.domain',
      'studio.nsite.domainHint',
      'studio.nsite.cname',
      'studio.nsite.url',
      'studio.nsite.publish',
      'studio.nsite.publishing',
      'studio.nsite.saveFirst',
      'studio.nsite.cache',
      'studio.nsite.version',
      'studio.nsite.publishedAt',
      'studio.nsite.retained',
      'studio.nsite.invalidHost',
      'studio.nsite.deleteTitle',
      'studio.nsite.deleteHint',
      'studio.nsite.delete',
      'studio.nsite.keep',
      'studio.nsite.cancel',
      'studio.nsite.status.disabled',
      'studio.nsite.status.pending',
      'studio.nsite.status.published',
      'studio.nsite.status.failed',
      'studio.reach.unavailable',
      'studio.reach.mirrorRequired',
      'studio.reach.publicBodyMirror',
      'studio.upload.steps.mirroring',
      'studio.upload.waitMirror',
      'studio.errors.mirrorFailed',
      'studio.errors.notLoggedIn',
      'studio.mirror.kinds.cleanup',
      'studio.mirror.kinds.blob-delete',
    ]
    for (const language of ['en', 'de', 'fr', 'es', 'ru', 'zh', 'ja']) {
      for (const key of keys) {
        expect(i18n.getResource(language, 'translation', key), `${language}: ${key}`).toBeTypeOf(
          'string'
        )
      }
    }
  })
  it('provides every homepage editor text in every Studio locale', () => {
    const en = i18n.getResource('en', 'translation', 'studio') as {
      homepage: Record<string, string>
      errors: { homepage: Record<string, string> }
    }
    const keys = [
      ...Object.keys(en.homepage).map(key => `studio.homepage.${key}`),
      ...Object.keys(en.errors.homepage).map(key => `studio.errors.homepage.${key}`),
    ]
    expect(keys).toContain('studio.homepage.moveUp')
    for (const language of ['de', 'fr', 'es', 'ru', 'zh', 'ja']) {
      for (const key of keys) {
        expect(i18n.getResource(language, 'translation', key), `${language}: ${key}`).toBeTypeOf(
          'string'
        )
      }
    }
  })

  it('names every sidebar page, its groups and the page descriptions in every Studio locale', () => {
    const languages = ['en', 'de', 'fr', 'es', 'ru', 'zh', 'ja']
    for (const language of languages) {
      for (const id of [
        'videos',
        'upload',
        'moderation',
        'appearance',
        'sitePages',
        'instance',
        'overview',
        'advanced',
        'account',
      ]) {
        expect(i18n.getResource(language, 'translation', `studio.nav.pages.${id}`)).toBeTypeOf(
          'string'
        )
      }
      for (const id of ['content', 'site', 'server']) {
        expect(i18n.getResource(language, 'translation', `studio.nav.groups.${id}`)).toBeTypeOf(
          'string'
        )
      }
      for (const key of ['studio.nav.menu', 'studio.nav.close', 'studio.nav.sections']) {
        expect(i18n.getResource(language, 'translation', key)).toBeTypeOf('string')
      }
      for (const id of ['appearance', 'instance', 'account', 'advanced']) {
        expect(
          i18n.getResource(language, 'translation', `studio.page.${id}.description`)
        ).toBeTypeOf('string')
      }
    }
  })
})
