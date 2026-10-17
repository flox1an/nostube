import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Cloud, HardDrive } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@nostube/widgets/components/alert'
import { Button } from '@nostube/widgets/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@nostube/widgets/components/card'
import { Input } from '@nostube/widgets/components/input'
import {
  loadStorageStatus,
  startStorageMove,
  testStorageConnection,
  type AdminState,
  type StorageStatus,
  type StorageTestResult,
} from './api'
import { s3FromDraft } from './draft'
import { Field, Tile } from './fields'
import { bytesText } from './OverviewPage'
import type { PageProps } from './AppearancePage'

/** `GET /api/admin/storage` now and every 5 s while mounted, as the nsite status. */
export function useStorageStatus() {
  const [status, setStatus] = useState<StorageStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    let timer: number | undefined
    const refresh = async () => {
      try {
        const next = await loadStorageStatus()
        if (live) {
          setStatus(next)
          setError(null)
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (live) timer = window.setTimeout(() => void refresh(), 5000)
      }
    }
    void refresh()
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [tick])
  return { status, error, refresh: () => setTick(n => n + 1) }
}

/** While the bucket does not answer: the provider's error and the way to the S3 settings. */
export function StorageWarning({ status }: { status: StorageStatus | null }) {
  const { t, i18n } = useTranslation()
  const s3 = status?.s3
  if (!s3 || s3.available) return null
  return (
    <Alert variant="destructive">
      <AlertTitle>{t('studio.storageS3.unavailableTitle')}</AlertTitle>
      <AlertDescription className="space-y-1">
        <p>{t('studio.storageS3.unavailableBody')}</p>
        {s3.lastError && <p className="break-all font-mono text-xs">{s3.lastError}</p>}
        {s3.lastAttempt !== null && (
          <p>
            {t('studio.storageS3.lastAttempt', {
              time: new Date(s3.lastAttempt * 1000).toLocaleString(i18n.resolvedLanguage),
            })}
          </p>
        )}
        <a
          href="#/instance/storage"
          className="underline"
          onClick={() => document.getElementById('s3-endpoint')?.focus()}
        >
          {t('studio.storageS3.fix')}
        </a>
      </AlertDescription>
    </Alert>
  )
}

type Probe = 'testing' | StorageTestResult | { errors: string[] }

/** Quota, reserve and where uploads go: this machine, or an S3-compatible bucket (advanced). */
export function StorageCard({
  draft,
  update,
  state,
  status,
  statusError,
  onMoveStarted,
}: PageProps & {
  state: AdminState
  status: StorageStatus | null
  statusError: string | null
  onMoveStarted: () => void
}) {
  const { t, i18n } = useTranslation()
  const [tested, setTested] = useState<{ key: string; probe: Probe } | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const s3Draft = s3FromDraft(draft)
  const key = JSON.stringify(s3Draft.s3)
  // A result answers the values tested; editing them makes it stale.
  const probe = tested?.key === key ? tested.probe : null
  const result = probe === 'testing' ? null : probe
  const bytes = (n: number) => bytesText(n, i18n.resolvedLanguage)

  const test = async () => {
    if (s3Draft.errors.length || !s3Draft.s3)
      return setTested({ key, probe: { errors: s3Draft.errors } })
    setTested({ key, probe: 'testing' })
    try {
      setTested({ key, probe: await testStorageConnection(s3Draft.s3) })
    } catch (e) {
      setTested({ key, probe: { errors: [e instanceof Error ? e.message : String(e)] } })
    }
  }

  const move = async () => {
    setStarting(true)
    setMoveError(null)
    try {
      await startStorageMove()
      onMoveStarted()
    } catch (e) {
      setMoveError(e instanceof Error ? e.message : String(e))
    } finally {
      setStarting(false)
    }
  }

  const m = status?.move
  // Only once S3 runs (saved and started): moving needs the bucket, and S3 cannot be turned off.
  const canMove = !!status?.s3 && !!m && (m.state === 'running' || m.localFiles > 0)
  return (
    <Card id="storage">
      <CardHeader>
        <CardTitle>{t('studio.instance.storage')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="quota"
            label={t('studio.instance.quota')}
            hint={t('studio.instance.quotaHint')}
          >
            <Input
              id="quota"
              type="number"
              min={0}
              value={draft.quota}
              onChange={e => update({ quota: e.target.value })}
            />
          </Field>
          <Field id="reserve" label={t('studio.instance.reserve')}>
            <Input
              id="reserve"
              type="number"
              min={0}
              value={draft.reserve}
              onChange={e => update({ reserve: e.target.value })}
            />
          </Field>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">{t('studio.storageS3.where')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Tile
              title={t('studio.storageS3.local')}
              icon={HardDrive}
              selected={draft.storageKind === 'local'}
              disabled={state.config.storage.s3 !== null}
              onSelect={() => update({ storageKind: 'local' })}
            >
              <span className="block">{t('studio.storageS3.localBody')}</span>
            </Tile>
            <Tile
              title={t('studio.storageS3.s3')}
              icon={Cloud}
              selected={draft.storageKind === 's3'}
              onSelect={() => update({ storageKind: 's3' })}
            >
              <span className="block">{t('studio.storageS3.s3Body')}</span>
            </Tile>
          </div>
          {state.config.storage.s3 !== null && (
            <p className="text-sm text-muted-foreground">{t('studio.storageS3.localLocked')}</p>
          )}
        </div>

        {draft.storageKind === 's3' && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="s3-endpoint"
                label={t('studio.storageS3.endpoint')}
                hint={t('studio.storageS3.endpointHint')}
              >
                <Input
                  id="s3-endpoint"
                  type="url"
                  value={draft.s3Endpoint}
                  placeholder="https://<account>.r2.cloudflarestorage.com"
                  onChange={e => update({ s3Endpoint: e.target.value })}
                />
              </Field>
              <Field id="s3-bucket" label={t('studio.storageS3.bucket')}>
                <Input
                  id="s3-bucket"
                  value={draft.s3Bucket}
                  onChange={e => update({ s3Bucket: e.target.value })}
                />
              </Field>
              <Field
                id="s3-region"
                label={t('studio.storageS3.region')}
                hint={t('studio.storageS3.regionHint')}
              >
                <Input
                  id="s3-region"
                  value={draft.s3Region}
                  placeholder="auto"
                  onChange={e => update({ s3Region: e.target.value })}
                />
              </Field>
              <Field id="s3-access-key" label={t('studio.storageS3.accessKey')}>
                <Input
                  id="s3-access-key"
                  autoComplete="off"
                  value={draft.s3AccessKey}
                  onChange={e => update({ s3AccessKey: e.target.value })}
                />
              </Field>
              <Field
                id="s3-secret"
                label={t('studio.storageS3.secret')}
                hint={t(
                  draft.s3SecretSet ? 'studio.storageS3.secretSet' : 'studio.storageS3.secretHint'
                )}
              >
                <Input
                  id="s3-secret"
                  type="password"
                  autoComplete="new-password"
                  value={draft.s3Secret}
                  onChange={e => update({ s3Secret: e.target.value })}
                />
              </Field>
            </div>
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.s3PathStyle}
                  onChange={e => update({ s3PathStyle: e.target.checked })}
                />
                {t('studio.storageS3.pathStyle')}
              </label>
              <p className="text-xs text-muted-foreground">{t('studio.storageS3.pathStyleHint')}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={probe === 'testing'}
              onClick={() => void test()}
            >
              {t(probe === 'testing' ? 'studio.storageS3.testing' : 'studio.storageS3.test')}
            </Button>
            {result && 'ok' in result && result.ok && (
              <p role="status" className="text-sm text-green-700 dark:text-green-400">
                {t('studio.storageS3.testOk')}
              </p>
            )}
            {result && 'ok' in result && !result.ok && (
              <p role="alert" className="break-all text-sm text-destructive">
                {t('studio.storageS3.testFailed', {
                  step: t(`studio.storageS3.steps.${result.step}`, { defaultValue: result.step }),
                  error: result.error,
                })}
              </p>
            )}
            {result && 'errors' in result && (
              <ul role="alert" className="list-disc pl-5 text-sm text-destructive">
                {result.errors.map(message => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {m && canMove && (
          <div className="space-y-2 text-sm" role="status" aria-live="polite">
            <p className="font-medium">{t('studio.storageS3.moveTitle')}</p>
            {m.state === 'running' ? (
              <>
                <p>
                  {t('studio.storageS3.moving', {
                    filesDone: m.filesDone,
                    filesTotal: m.filesTotal,
                    bytesDone: bytes(m.bytesDone),
                    bytesTotal: bytes(m.bytesTotal),
                  })}
                </p>
                <progress className="w-full" value={m.bytesDone} max={m.bytesTotal || 1} />
              </>
            ) : (
              <>
                <p>
                  {t('studio.storageS3.moveLocal', {
                    files: m.localFiles,
                    bytes: bytes(m.localBytes),
                  })}
                </p>
                <Button
                  type="button"
                  disabled={starting || status?.s3?.available === false}
                  onClick={() => void move()}
                >
                  {t('studio.storageS3.move')}
                </Button>
                <p className="text-xs text-muted-foreground">{t('studio.storageS3.moveHint')}</p>
              </>
            )}
          </div>
        )}
        {m && status?.s3 && m.state === 'completed' && (
          <p role="status" className="text-sm">
            {t('studio.storageS3.moveDone', { files: m.filesDone, bytes: bytes(m.bytesDone) })}
          </p>
        )}
        {m && status?.s3 && m.state === 'failed' && m.error && (
          <p role="alert" className="break-all text-sm text-destructive">
            {t('studio.storageS3.moveFailed', { error: m.error })}
          </p>
        )}
        {(moveError || statusError) && (
          <p role="alert" className="break-all text-sm text-destructive">
            {moveError ?? statusError}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
