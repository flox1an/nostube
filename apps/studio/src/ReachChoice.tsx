import { useTranslation } from 'react-i18next'
import type { Reach } from '@nostube/core/instance-config'
import { Tile } from './fields'

/**
 * Privat or Öffentlich (Reach, server ADR 0012). Öffentlich cannot be taken back fully, so
 * switching to it asks first; it is locked while the origin is not publicly reachable.
 */
export function ReachChoice({
  reach,
  onChange,
  canBePublic,
  own,
}: {
  reach: Reach | null
  onChange: (reach: Reach) => void
  canBePublic: boolean
  /** Own identity: the owner keeps their Nostr profile themselves, the server signs nothing. */
  own: boolean
}) {
  const { t } = useTranslation()
  const choosePublic = () => {
    if (reach !== 'public' && window.confirm(t('studio.reach.confirmPublic'))) onChange('public')
  }
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <Tile
          title={t('studio.reach.privateTitle')}
          selected={reach === 'private'}
          onSelect={() => onChange('private')}
        >
          <span className="block">
            {t(own ? 'studio.reach.privateLeadOwn' : 'studio.reach.privateLead')}{' '}
            {t('studio.reach.privateBody')}
          </span>
        </Tile>
        <Tile
          title={t('studio.reach.publicTitle')}
          selected={reach === 'public'}
          disabled={!canBePublic}
          onSelect={choosePublic}
        >
          <span className="block">{t('studio.reach.publicBody')}</span>
        </Tile>
      </div>
      {!canBePublic && (
        <p className="text-sm text-muted-foreground">{t('studio.reach.unavailable')}</p>
      )}
    </div>
  )
}
