import { useTranslation } from 'react-i18next'
import type { AdminState } from './api'
import type { PageProps } from './AppearancePage'
import { PageHeader } from './PageHeader'
import { StorageCard, StorageWarning, useStorageStatus } from './StorageCard'

/** Where uploads go, how much may be stored and how much disk stays free. */
export function StoragePage({ draft, update, state }: PageProps & { state: AdminState }) {
  const { t } = useTranslation()
  const storage = useStorageStatus()
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('studio.nav.pages.storage')}
        description={t('studio.page.storage.description')}
      />
      <StorageWarning status={storage.status} />
      <StorageCard
        draft={draft}
        update={update}
        state={state}
        status={storage.status}
        statusError={storage.error}
        onMoveStarted={storage.refresh}
      />
    </div>
  )
}
