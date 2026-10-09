import { useTranslation } from 'react-i18next'

export interface AgeConfirmProps {
  onConfirm: () => void
  onCancel: () => void
}

/** Asked once when the viewer opens a video with a content warning. */
export function AgeConfirm({ onConfirm, onCancel }: AgeConfirmProps) {
  const { t } = useTranslation()
  return (
    <section
      role="alertdialog"
      aria-labelledby="age-confirm-title"
      className="space-y-3 rounded-lg border border-border bg-card p-4"
    >
      <h2 id="age-confirm-title" className="text-lg font-medium">
        {t('site.ageGate.title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('site.ageGate.body')}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
        >
          {t('site.ageGate.confirm')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-3 py-1.5 text-sm"
        >
          {t('site.ageGate.cancel')}
        </button>
      </div>
    </section>
  )
}
