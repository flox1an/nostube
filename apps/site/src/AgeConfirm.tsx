export interface AgeConfirmProps {
  onConfirm: () => void
  onCancel: () => void
}

/** Asked once when the viewer opens a video with a content warning. */
export function AgeConfirm({ onConfirm, onCancel }: AgeConfirmProps) {
  return (
    <section
      role="alertdialog"
      aria-labelledby="age-confirm-title"
      className="space-y-3 rounded-lg border border-border bg-card p-4"
    >
      <h2 id="age-confirm-title" className="text-lg font-medium">
        This video has a content warning
      </h2>
      <p className="text-sm text-muted-foreground">
        It may contain content that is not suitable for everyone. Confirm that you are 18 or older
        to continue. Your confirmation is stored in this browser.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
        >
          I am 18 or older
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
      </div>
    </section>
  )
}
