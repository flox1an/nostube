import { useCurrentUser, useVideoUpload, useAppContext, useSelectedPreset } from '@/hooks'
import { buildVideoPath } from '@/utils/video-utils'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@nostube/widgets/components/card'
import { Button } from '@nostube/widgets/components/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@nostube/widgets/components/dialog'
import { BlossomServersSection } from './settings/BlossomServersSection'
import { AuthDialog } from './auth/AuthDialog'
import { EmptyState } from './EmptyState'
import { DeleteVideoDialog } from './video-upload/DeleteVideoDialog'
import { DeleteDraftDialog } from './upload/DeleteDraftDialog'
import { deleteBlobsFromServers, type DeleteBlobsProgress } from '@/lib/blossom-upload'
import { useUploadNotifications } from '@/hooks/useUploadNotifications'
import { useToast } from '@/hooks/useToast'
import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useRef, useState } from 'react'
import { defaultBlossomServers } from '@/lib/blossom-servers'
import { generateEventLink } from '@/lib/nostr'
import type { UploadDraft, BrowserTranscodeState } from '@/types/upload-draft'
import type { BrowserTranscodeVariant, TranscodeSourceMeta } from '@nostube/core/video-transcode'
import { useUploadDrafts } from '@/hooks/useUploadDrafts'
import { getBrowserTranscodeUploadDraft } from '@/lib/browser-transcode-upload-manager'
import { takeSharedFile } from '@/lib/shared-file'
import { UploadFlowFooter } from './video-upload/UploadFlowFooter'
import type { UploadScreen } from './video-upload/UploadFlowFooter'
import { UploadSourceScreen } from './video-upload/UploadSourceScreen'
import { UploadDetailsScreen } from './video-upload/UploadDetailsScreen'
import { UploadPublishPanel } from './video-upload/UploadPublishPanel'
import { Switch } from '@nostube/widgets/components/switch'
import { Label } from '@nostube/widgets/components/label'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { Film, ListChecks, UploadCloud } from 'lucide-react'

// ── Screen derivation ────────────────────────────────────────────────────────

/** Minimum screen based on draft state. */
function deriveMinScreen(
  draft: UploadDraft,
  browserTranscodeState: BrowserTranscodeState | null | undefined
): UploadScreen {
  const hasVideo = draft.uploadInfo.videos.length > 0
  const jobActive = !!browserTranscodeState
  if (!hasVideo && !jobActive && !draft.videoUrl) return 'source'
  return 'details'
}

/** Resolve initial screen from query params + draft state, with clamping. */
function resolveInitialScreen(
  searchParams: URLSearchParams,
  draft: UploadDraft,
  browserTranscodeState: BrowserTranscodeState | null | undefined
): UploadScreen {
  const minScreen = deriveMinScreen(draft, browserTranscodeState)

  // Parse requested screen
  let requested: UploadScreen | null = null
  const screenParam = searchParams.get('screen')
  const stepParam = searchParams.get('step')

  if (screenParam === 'source' || screenParam === 'details') {
    requested = screenParam
  } else if (screenParam === 'review') {
    // Review and publishing now live on the details page (old links and notifications).
    requested = 'details'
  } else if (stepParam) {
    const step = parseInt(stepParam, 10)
    if (!isNaN(step)) {
      if (step === 2 && draft.videoUrl) requested = 'details'
      else if (step <= 2) requested = 'source'
      else requested = 'details'
    }
  }

  if (!requested) return minScreen
  // Don't advance beyond what the draft state supports
  if (requested === 'details' && minScreen === 'source') return 'source'
  return requested
}

// ── Component ────────────────────────────────────────────────────────────────

interface UploadFormProps {
  draft: UploadDraft
  onBack?: () => void
  onPersist?: () => void
}

export function VideoUpload({ draft, onBack, onPersist }: UploadFormProps) {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const { updateDraft, deleteDraft } = useUploadDrafts()
  const { toast } = useToast()
  const { removeByDraftId } = useUploadNotifications()
  const { user } = useCurrentUser()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [authDialogOpen, setAuthDialogOpen] = useState(false)

  const handleDraftChange = useCallback(
    (updates: Partial<UploadDraft>) => {
      updateDraft(draft.id, updates)
    },
    [draft.id, updateDraft]
  )

  const videoUploadState = useVideoUpload(draft, handleDraftChange)
  const {
    title,
    setTitle,
    description,
    setDescription,
    tags,
    setTags,
    language,
    setLanguage,
    people,
    setPeople,
    origins,
    setOrigins,
    inputMethod,
    setInputMethod,
    videoUrl,
    setVideoUrl,
    file,
    uploadInfo,
    uploadState,
    thumbnailBlob,
    thumbnailSource,
    thumbnailUploadInfo,
    contentWarningEnabled,
    setContentWarningEnabled,
    contentWarningReason,
    setContentWarningReason,
    expiration,
    setExpiration,
    publishAt,
    setPublishAt,
    uploadProgress,
    browserTranscodeState,
    uploadServers,
    isPublishing,
    publishRelays,
    setPublishRelays,
    writeRelays,
    previewEvent,
    videoToDelete,
    setVideoToDelete,
    deletingIndex,
    subtitles,
    subtitleUploading,
    metadataDetected,
    originalVideoInfo,

    handleUrlVideoProcessing,
    handleThumbnailDrop,
    handleAutoThumbnailCapture,
    handleThumbnailSourceChange,
    handleDeleteThumbnail,
    onDrop,
    handleBrowserTranscodeComplete,
    handleBrowserTranscodeSkip,
    handleStartBrowserTranscodeUpload,
    handleCancelBrowserTranscodeUpload,
    handleRetryBrowserTranscodeUpload,
    handleSubmit: originalHandleSubmit,
    handleAddVideo,
    handleRemoveVideo,
    handleRemoveVideoFromFormOnly,
    handleRemoveVideoWithBlobs,
    handleAddTranscodedVideo,
    handleSubtitleDrop,
    handleRemoveSubtitle,
    handleSubtitleLanguageChange,
  } = videoUploadState

  // ── Screen state ─────────────────────────────────────────────────────────

  // Pro mode: every optional section open, relay choice and event preview. Remembered.
  const [proMode, setProMode] = useLocalStorage<boolean>('nostube_upload_pro_mode', false)
  const handleProModeChange = useCallback(
    (enabled: boolean) => {
      setProMode(enabled)
      // Leaving Pro mode hides the relay choice, so publishing goes to all write relays again.
      if (!enabled) setPublishRelays(null)
    },
    [setProMode, setPublishRelays]
  )

  const jumpTo = useCallback((field: 'processing' | 'title' | 'thumbnail') => {
    const id = { processing: 'upload-processing', title: 'title', thumbnail: 'upload-thumbnail' }[
      field
    ]
    const element = document.getElementById(id)
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (field === 'title') (element as HTMLInputElement | null)?.focus({ preventScroll: true })
  }, [])

  const [screen, setScreen] = useState<UploadScreen>(() => {
    const initialJob = getBrowserTranscodeUploadDraft(draft.id)
    return resolveInitialScreen(searchParams, draft, initialJob?.state)
  })

  // Auto-advance from Source to Details when background job starts or URL
  // processing completes (Phase 3 fills in the full logic; this is the minimal wire)
  useEffect(() => {
    if (screen !== 'source') return
    const jobStarted = !!browserTranscodeState && browserTranscodeState.status !== 'complete'
    const uploadStarted = uploadState === 'uploading'
    const videosReady = uploadInfo.videos.length > 0
    if (jobStarted || uploadStarted || videosReady) {
      setScreen('details')
    }
  }, [screen, browserTranscodeState, uploadState, uploadInfo.videos.length])

  // Auto-process URL from draft when loaded into the Details screen
  const autoProcessed = useRef(false)
  useEffect(() => {
    if (
      !autoProcessed.current &&
      inputMethod === 'url' &&
      videoUrl &&
      uploadInfo.videos.length === 0 &&
      uploadState === 'initial' &&
      !file
    ) {
      autoProcessed.current = true
      onPersist?.()
      handleUrlVideoProcessing(videoUrl)
    }
  }, [
    inputMethod,
    videoUrl,
    uploadInfo.videos.length,
    uploadState,
    file,
    handleUrlVideoProcessing,
    onPersist,
  ])

  // ── Metadata toast ────────────────────────────────────────────────────────

  useEffect(() => {
    if (metadataDetected) {
      toast({
        title: t('upload.metadata_detected'),
        description: t('upload.metadata_auto_populated'),
        duration: 5000,
      })
    }
  }, [metadataDetected, toast, t])

  // ── Back / save / delete handlers ────────────────────────────────────────

  // Captures the full editable form state into a draft update — used both by
  // "Back" exiting from the source screen and by the explicit "Save Draft"
  // action, so saving never depends on which wizard step is active.
  const buildDraftSnapshot = useCallback(
    (): Partial<UploadDraft> => ({
      title,
      description,
      tags,
      language,
      people,
      origins,
      inputMethod,
      videoUrl,
      uploadInfo,
      thumbnailUploadInfo: {
        uploadedBlobs: thumbnailUploadInfo.uploadedBlobs,
        mirroredBlobs: thumbnailUploadInfo.mirroredBlobs,
      },
      subtitles,
      contentWarning: { enabled: contentWarningEnabled, reason: contentWarningReason },
      expiration,
      publishAt,
      thumbnailSource,
      updatedAt: Date.now(),
    }),
    [
      title,
      description,
      tags,
      language,
      people,
      origins,
      inputMethod,
      videoUrl,
      uploadInfo,
      thumbnailUploadInfo,
      subtitles,
      contentWarningEnabled,
      contentWarningReason,
      expiration,
      publishAt,
      thumbnailSource,
    ]
  )

  const handleBack = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('[VideoUpload] handleBack from screen:', screen)
    }

    if (screen === 'details') {
      setScreen('source')
      return
    }
    // source → exit: flush draft then call onBack
    handleDraftChange(buildDraftSnapshot())
    if (onBack) {
      queueMicrotask(() => onBack())
    }
  }, [screen, handleDraftChange, buildDraftSnapshot, onBack])

  // Explicit "Save Draft": persists the current edits regardless of which
  // wizard step is active and gives honest feedback — it must never regress
  // a step (that's what Back is for) and must never report success or leave
  // the editor when persistence actually failed.
  const handleSaveDraft = useCallback(() => {
    try {
      handleDraftChange(buildDraftSnapshot())
      toast({ title: t('upload.draft.saved', { defaultValue: 'Draft saved' }) })
      if (onBack) {
        queueMicrotask(() => onBack())
      }
    } catch (error) {
      console.error('[VideoUpload] Failed to save draft:', error)
      toast({
        title: t('upload.draft.saveFailed', { defaultValue: 'Failed to save draft' }),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    }
  }, [handleDraftChange, buildDraftSnapshot, onBack, toast, t])

  const handleDeleteDraftOnly = useCallback(() => {
    deleteDraft(draft.id)
    removeByDraftId(draft.id)
    toast({
      title: t('upload.draft.deleted'),
    })

    if (onBack) {
      queueMicrotask(() => onBack())
    }
  }, [deleteDraft, draft.id, removeByDraftId, toast, t, onBack])

  const handleDeleteWithMedia = useCallback(
    async (onProgress: (progress: DeleteBlobsProgress) => void) => {
      if (!user?.signer) throw new Error('User not logged in')

      const allBlobs = [
        ...draft.uploadInfo.videos.flatMap(v => [...v.uploadedBlobs, ...v.mirroredBlobs]),
        ...draft.thumbnailUploadInfo.uploadedBlobs,
        ...draft.thumbnailUploadInfo.mirroredBlobs,
        ...(draft.subtitles ?? []).flatMap(subtitle => [
          ...subtitle.uploadedBlobs,
          ...subtitle.mirroredBlobs,
        ]),
      ]

      const { totalSuccessful, totalFailed } = await deleteBlobsFromServers(
        allBlobs,
        async eventDraft => await user.signer.signEvent(eventDraft),
        { concurrency: 3, onProgress }
      )

      deleteDraft(draft.id)
      removeByDraftId(draft.id)

      if (totalSuccessful > 0 && totalFailed === 0) {
        toast({
          title: t('upload.draft.deletedWithMedia'),
          description: t('upload.draft.deletedWithMediaDescription', { count: totalSuccessful }),
          duration: 3000,
        })
      } else if (totalSuccessful > 0 && totalFailed > 0) {
        toast({
          title: t('upload.draft.deletedPartial'),
          description: t('upload.draft.deletedPartialDescription', {
            successful: totalSuccessful,
            failed: totalFailed,
          }),
          duration: 5000,
        })
      } else {
        toast({
          title: t('upload.draft.deletedMediaFailed'),
          description: t('upload.draft.deletedMediaFailedDescription'),
          variant: 'destructive',
          duration: 5000,
        })
      }

      if (onBack) onBack()
    },
    [user, draft, deleteDraft, removeByDraftId, toast, t, onBack]
  )

  // ── Publish ───────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const publishedEvent = await originalHandleSubmit(e)
      if (publishedEvent) {
        deleteDraft(draft.id)
        const eventLink = generateEventLink(publishedEvent, publishedEvent.identifier)
        navigate(buildVideoPath(eventLink, 'video'))
      }
    } catch (error) {
      console.error('Publish failed:', error)
    }
  }

  // ── File drop (persists ephemeral draft first) ────────────────────────────

  const wrappedOnDrop = useCallback(
    (files: File[]) => {
      setInputMethod('file')
      onPersist?.()
      onDrop(files)
    },
    [onPersist, onDrop, setInputMethod]
  )

  // Video shared into the installed app (/upload?shared=1, see lib/shared-file.ts): it waits
  // in the service worker's cache through the sign-in gate, then lands in this fresh draft.
  const sharedTaken = useRef(false)
  useEffect(() => {
    if (!user || !searchParams.has('shared') || sharedTaken.current) return
    if (file || uploadInfo.videos.length > 0) return
    sharedTaken.current = true
    void takeSharedFile()
      .then(shared => shared && wrappedOnDrop([shared]))
      .finally(() =>
        setSearchParams(
          params => {
            params.delete('shared')
            return params
          },
          { replace: true }
        )
      )
  }, [user, searchParams, setSearchParams, file, uploadInfo.videos.length, wrappedOnDrop])

  const wrappedOnUrlProcess = useCallback(
    (url: string) => {
      onPersist?.()
      handleUrlVideoProcessing(url)
    },
    [onPersist, handleUrlVideoProcessing]
  )

  const wrappedOnAddAdditional = useCallback(
    (files: File[]) => {
      setInputMethod('file')
      onPersist?.()
      handleAddVideo(files)
    },
    [onPersist, handleAddVideo, setInputMethod]
  )

  const wrappedOnStartBackground = useCallback(
    async (
      variants: BrowserTranscodeVariant[],
      sourceMeta: TranscodeSourceMeta,
      keepOriginal: boolean
    ) => {
      onPersist?.()
      await handleStartBrowserTranscodeUpload(variants, sourceMeta, keepOriginal)
    },
    [onPersist, handleStartBrowserTranscodeUpload]
  )

  // ── Server config ─────────────────────────────────────────────────────────

  const { config, updateConfig } = useAppContext()
  const { presetContent } = useSelectedPreset()
  const [showServerSettings, setShowServerSettings] = useState(false)
  const openServerSettings = useCallback(() => setShowServerSettings(true), [])

  // Nobody starts without a server: seed the defaults once, the storage card shows them.
  const addDefaultServers = useCallback(() => {
    updateConfig(current => ({
      ...current,
      blossomServers: defaultBlossomServers(presetContent.defaultBlossomProxy),
    }))
  }, [updateConfig, presetContent.defaultBlossomProxy])

  // Checks the whole list, not just the servers switched on: seeding replaces the list.
  const configuredServerCount = config.blossomServers?.length ?? 0
  useEffect(() => {
    if (configuredServerCount > 0 || !user) return
    addDefaultServers()
  }, [configuredServerCount, user, addDefaultServers])

  // ── Derived state ─────────────────────────────────────────────────────────

  const hasUploadedThumbnail = thumbnailUploadInfo.uploadedBlobs.length > 0
  const hasThumbnailSet = !!(thumbnailBlob || thumbnailUploadInfo.uploadedBlobs.length > 0)
  const hasHlsVideo = uploadInfo.videos.some(
    video =>
      video.mimeType === 'application/vnd.apple.mpegurl' || (video.hlsVariants?.length ?? 0) > 0
  )
  const browserJobActive =
    !!browserTranscodeState &&
    ['queued', 'transcoding', 'uploading'].includes(browserTranscodeState.status)

  // Continue gating per screen
  const continueDisabled = uploadInfo.videos.length === 0

  // Source screen: hide Continue while BrowserTranscodeStep settings are showing
  const showContinue =
    screen === 'source' && !(!!file && uploadState === 'transcoding' && !browserTranscodeState)

  // ── Screen titles ─────────────────────────────────────────────────────────

  const screenTitle = t('upload.screen.source.title', { defaultValue: 'Upload video' })

  const screenDescription =
    screen === 'source'
      ? t('upload.screen.source.description', {
          defaultValue: 'Choose file upload or URL to start',
        })
      : t('upload.screen.details.description', {
          defaultValue: 'Add details while your video is processed',
        })

  if (!user) {
    return (
      <div className="max-w-560 mx-auto sm:p-4">
        <EmptyState
          heading="h1"
          title={t('upload.signedOut.title', { defaultValue: 'Share your video with nostube' })}
          description={t('upload.signedOut.subtitle', {
            defaultValue: 'Sign in to publish. Details and publishing are on one page.',
          })}
        >
          <ol className="flex flex-col sm:flex-row items-center justify-center gap-3 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <UploadCloud className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t('upload.signedOut.stepChoose', { defaultValue: 'Choose video' })}
              <span className="hidden text-muted-foreground/50 sm:inline" aria-hidden="true">
                →
              </span>
            </li>
            <li className="flex items-center gap-2">
              <Film className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t('upload.signedOut.stepDetails', { defaultValue: 'Add details' })}
              <span className="hidden text-muted-foreground/50 sm:inline" aria-hidden="true">
                →
              </span>
            </li>
            <li className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t('upload.signedOut.stepPublish', { defaultValue: 'Publish' })}
            </li>
          </ol>
          <Button className="h-11 px-6" onClick={() => setAuthDialogOpen(true)}>
            {t('upload.signedOut.cta', { defaultValue: 'Sign in to upload' })}
          </Button>
        </EmptyState>
        <AuthDialog
          isOpen={authDialogOpen}
          onClose={() => setAuthDialogOpen(false)}
          onLogin={() => setAuthDialogOpen(false)}
        />
      </div>
    )
  }

  return (
    <>
      <Card className="mt-4 max-w-6xl mx-auto">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3">
            <span>{screenTitle}</span>
            {(screen === 'details' || !!file) && (
              <div className="flex items-center gap-2 text-sm font-normal">
                <Switch
                  id="upload-pro-mode"
                  checked={proMode}
                  onCheckedChange={handleProModeChange}
                />
                <Label htmlFor="upload-pro-mode" className="cursor-pointer">
                  {t('upload.proMode', { defaultValue: 'Show all options' })}
                </Label>
              </div>
            )}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">{screenDescription}</p>
        </CardHeader>

        <CardContent className="space-y-4">
          {screen === 'source' && (
            <UploadSourceScreen
              pro={proMode}
              draftId={draft.id}
              file={file}
              videoUrl={videoUrl}
              setVideoUrl={setVideoUrl}
              inputMethod={inputMethod}
              setInputMethod={setInputMethod}
              uploadState={uploadState}
              uploadInfo={uploadInfo}
              uploadProgress={uploadProgress}
              browserTranscodeState={browserTranscodeState}
              originalVideoInfo={originalVideoInfo}
              deletingIndex={deletingIndex}
              hasHlsVideo={hasHlsVideo}
              servers={uploadServers}
              serverCount={configuredServerCount}
              onFileDrop={wrappedOnDrop}
              onUrlProcess={wrappedOnUrlProcess}
              onStartBackground={wrappedOnStartBackground}
              onCancelBackground={handleCancelBrowserTranscodeUpload}
              onBrowserTranscodeComplete={handleBrowserTranscodeComplete}
              onBrowserTranscodeSkip={handleBrowserTranscodeSkip}
              onConfigureServers={openServerSettings}
              onAddDefaultServers={addDefaultServers}
              onRemoveVideo={handleRemoveVideo}
              onAddAdditional={wrappedOnAddAdditional}
              onAddTranscodedVideo={handleAddTranscodedVideo}
              onStatusChange={() => {
                // DVM status no longer tracked here — use UploadManager on Review
              }}
            />
          )}

          {screen === 'details' && (
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
              <UploadDetailsScreen
                pro={proMode}
                title={title}
                setTitle={setTitle}
                description={description}
                setDescription={setDescription}
                tags={tags}
                setTags={setTags}
                language={language}
                setLanguage={setLanguage}
                thumbnailSource={thumbnailSource}
                onThumbnailSourceChange={handleThumbnailSourceChange}
                thumbnailBlob={thumbnailBlob}
                onThumbnailDrop={handleThumbnailDrop}
                onAutoThumbnailCapture={handleAutoThumbnailCapture}
                onDeleteThumbnail={handleDeleteThumbnail}
                thumbnailUploadInfo={thumbnailUploadInfo}
                file={file}
                videoUrl={videoUrl}
                uploadInfo={uploadInfo}
                subtitles={subtitles}
                onSubtitleDrop={handleSubtitleDrop}
                onRemoveSubtitle={handleRemoveSubtitle}
                onSubtitleLanguageChange={handleSubtitleLanguageChange}
                subtitleUploading={subtitleUploading}
                publishAt={publishAt}
                setPublishAt={setPublishAt}
                contentWarningEnabled={contentWarningEnabled}
                setContentWarningEnabled={setContentWarningEnabled}
                contentWarningReason={contentWarningReason}
                setContentWarningReason={setContentWarningReason}
                expiration={expiration}
                setExpiration={setExpiration}
                people={people}
                setPeople={setPeople}
                origins={origins}
                setOrigins={setOrigins}
                draftId={draft.id}
                videos={uploadInfo.videos}
                uploadState={uploadState}
                uploadProgress={uploadProgress}
                browserTranscodeState={browserTranscodeState}
                deletingIndex={deletingIndex}
                hasHlsVideo={hasHlsVideo}
                onRemoveVideo={handleRemoveVideo}
                onAddAdditional={wrappedOnAddAdditional}
                onAddTranscodedVideo={handleAddTranscodedVideo}
                onStatusChange={() => {
                  // DVM status comes from UploadManager on Review; no longer needed here
                }}
                onChangeSettings={() => setScreen('source')}
                onRetryProcessing={handleRetryBrowserTranscodeUpload}
                hasSourceFile={!!file}
                onCancelProcessing={handleCancelBrowserTranscodeUpload}
                onStartBackground={wrappedOnStartBackground}
                onBrowserTranscodeComplete={handleBrowserTranscodeComplete}
                onBrowserTranscodeSkip={handleBrowserTranscodeSkip}
              />
              <div className="lg:sticky lg:top-20">
                <UploadPublishPanel
                  title={title}
                  description={description}
                  tags={tags}
                  thumbnailBlob={thumbnailBlob}
                  thumbnailUploadInfo={thumbnailUploadInfo}
                  originalVideoInfo={originalVideoInfo}
                  videos={uploadInfo.videos}
                  hasThumbnailSet={hasThumbnailSet}
                  browserTranscodeState={browserTranscodeState}
                  draftId={draft.id}
                  writeRelays={writeRelays}
                  publishRelays={publishRelays}
                  setPublishRelays={setPublishRelays}
                  isPublishing={isPublishing}
                  canPublish={
                    !browserJobActive &&
                    hasThumbnailSet &&
                    title.trim().length > 0 &&
                    uploadInfo.videos.length > 0
                  }
                  handleSubmit={handleSubmit}
                  previewEvent={previewEvent}
                  onJump={jumpTo}
                  pro={proMode}
                  uploadInProgress={uploadState === 'transcoding' || uploadState === 'uploading'}
                />
              </div>
            </div>
          )}

          <UploadFlowFooter
            screen={screen}
            onBack={handleBack}
            onContinue={() => setScreen('details')}
            continueDisabled={continueDisabled}
            showContinue={showContinue}
            onSaveDraft={onBack ? handleSaveDraft : undefined}
            onDeleteDraft={onBack ? () => setShowDeleteDialog(true) : undefined}
          />
        </CardContent>
      </Card>

      {/* Server settings: same editor as Settings → Network */}
      <Dialog open={showServerSettings} onOpenChange={setShowServerSettings}>
        <DialogContent className="flex max-h-[90vh] max-w-lg flex-col gap-5">
          <DialogHeader>
            <DialogTitle>
              {t('upload.storage.choose', { defaultValue: 'Choose servers' })}
            </DialogTitle>
            <DialogDescription>
              {t('upload.storage.dialogDescription', {
                defaultValue: 'Your videos are stored on Blossom servers, not by nostube.',
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            <BlossomServersSection />
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setShowServerSettings(false)}>
              {t('common.done', { defaultValue: 'Done' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Video Dialog */}
      <DeleteVideoDialog
        open={videoToDelete !== null}
        onOpenChange={open => {
          if (!open) setVideoToDelete(null)
        }}
        video={videoToDelete?.video ?? null}
        onDeleteFromFormOnly={handleRemoveVideoFromFormOnly}
        onDeleteWithBlobs={handleRemoveVideoWithBlobs}
      />

      {/* Delete Draft Dialog */}
      <DeleteDraftDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        draft={draft}
        onDeleteDraftOnly={handleDeleteDraftOnly}
        onDeleteWithMedia={handleDeleteWithMedia}
      />

      {/* unused suppression — hasUploadedThumbnail ref kept to avoid lint warning */}
      {hasUploadedThumbnail && null}
    </>
  )
}
