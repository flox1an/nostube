import { useCurrentUser, useVideoUpload, useAppContext } from '@/hooks'
import { buildVideoPath } from '@/utils/video-utils'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { BlossomOnboardingStep } from './onboarding/BlossomOnboardingStep'
import { BlossomServerPicker } from './onboarding/BlossomServerPicker'
import { UploadOnboardingDialog } from './video-upload/UploadOnboardingDialog'
import { DeleteVideoDialog } from './video-upload/DeleteVideoDialog'
import { DeleteDraftDialog } from './upload/DeleteDraftDialog'
import { deleteBlobsFromServers, type DeleteBlobsProgress } from '@/lib/blossom-upload'
import { useUploadNotifications } from '@/hooks/useUploadNotifications'
import { useToast } from '@/hooks/useToast'
import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useRef, useState } from 'react'
import { deriveServerName } from '@/lib/blossom-servers'
import { generateEventLink } from '@/lib/nostr'
import type { BlossomServerTag } from '@/contexts/AppContext'
import type { UploadDraft, BrowserTranscodeState } from '@/types/upload-draft'
import type { BrowserTranscodeVariant, TranscodeSourceMeta } from '@/lib/video-transcode'
import { useUploadDrafts } from '@/hooks/useUploadDrafts'
import { isBetaUser } from '@/lib/beta-users'
import { getBrowserTranscodeUploadDraft } from '@/lib/browser-transcode-upload-manager'
import { UploadFlowFooter } from './video-upload/UploadFlowFooter'
import type { UploadScreen } from './video-upload/UploadFlowFooter'
import { UploadSourceScreen } from './video-upload/UploadSourceScreen'
import { UploadDetailsScreen } from './video-upload/UploadDetailsScreen'
import { UploadReviewScreen } from './video-upload/UploadReviewScreen'

// ── Screen derivation ────────────────────────────────────────────────────────

/** Minimum screen based on draft state — never advances to 'review' automatically. */
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

  if (screenParam === 'source' || screenParam === 'details' || screenParam === 'review') {
    requested = screenParam
  } else if (stepParam) {
    const step = parseInt(stepParam, 10)
    if (!isNaN(step)) {
      if (step === 2 && draft.videoUrl) requested = 'details'
      else if (step <= 2) requested = 'source'
      else if (step <= 5) requested = 'details'
      else requested = 'review'
    }
  }

  // Never auto-resume to 'review'
  if (!requested || requested === 'review') return minScreen
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
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const { updateDraft, deleteDraft } = useUploadDrafts()
  const { toast } = useToast()
  const { removeByDraftId } = useUploadNotifications()
  const { user } = useCurrentUser()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

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
    blossomInitalUploadServers,
    blossomMirrorServers,
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

  const handleBack = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('[VideoUpload] handleBack from screen:', screen)
    }

    if (screen === 'review') {
      setScreen('details')
      return
    }
    if (screen === 'details') {
      setScreen('source')
      return
    }
    // source → exit: flush draft then call onBack
    handleDraftChange({
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
    })
    if (onBack) {
      queueMicrotask(() => onBack())
    }
  }, [
    screen,
    handleDraftChange,
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
    onBack,
  ])

  const handleDeleteDraftOnly = useCallback(() => {
    deleteDraft(draft.id)
    removeByDraftId(draft.id)
    toast({
      title: t('upload.draft.deleted'),
      description: t('upload.draft.deletedDescription'),
      duration: 3000,
    })
    if (onBack) onBack()
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
  const betaUser = isBetaUser(user?.pubkey)
  const [onboardingSkipped, setOnboardingSkipped] = useState(false)
  const [showBlossomOnboarding, setShowBlossomOnboarding] = useState(false)
  const [showUploadPicker, setShowUploadPicker] = useState(false)
  const [showMirrorPicker, setShowMirrorPicker] = useState(false)

  const [uploadServers, setUploadServers] = useState<string[]>(
    () =>
      config.blossomServers?.filter(s => s.tags.includes('initial upload')).map(s => s.url) || []
  )
  const [mirrorServers, setMirrorServers] = useState<string[]>(
    () => config.blossomServers?.filter(s => s.tags.includes('mirror')).map(s => s.url) || []
  )

  const openBlossomOnboarding = useCallback(() => {
    setUploadServers(
      config.blossomServers?.filter(s => s.tags.includes('initial upload')).map(s => s.url) || []
    )
    setMirrorServers(
      config.blossomServers?.filter(s => s.tags.includes('mirror')).map(s => s.url) || []
    )
    setShowBlossomOnboarding(true)
  }, [config.blossomServers])

  const handleBlossomOnboardingComplete = useCallback(() => {
    const blossomServers = [
      ...uploadServers.map(url => ({
        url,
        name: deriveServerName(url),
        tags: ['initial upload'] as BlossomServerTag[],
      })),
      ...mirrorServers.map(url => ({
        url,
        name: deriveServerName(url),
        tags: ['mirror'] as BlossomServerTag[],
      })),
    ]
    updateConfig(current => ({ ...current, blossomServers }))
    setShowBlossomOnboarding(false)
  }, [uploadServers, mirrorServers, updateConfig])

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
  const continueDisabled =
    screen === 'source'
      ? uploadInfo.videos.length === 0
      : screen === 'details'
        ? title.trim().length === 0
        : false

  // Source screen: hide Continue while BrowserTranscodeStep settings are showing
  const showContinue =
    screen !== 'review' &&
    !(screen === 'source' && !!file && uploadState === 'transcoding' && !browserTranscodeState)

  // ── Screen titles ─────────────────────────────────────────────────────────

  const screenTitle =
    screen === 'source'
      ? t('upload.screen.source.title', { defaultValue: 'Upload video' })
      : screen === 'details'
        ? t('upload.screen.details.title', { defaultValue: 'Details' })
        : t('upload.screen.review.title', { defaultValue: 'Review & publish' })

  const screenDescription =
    screen === 'source'
      ? t('upload.screen.source.description', {
          defaultValue: 'Choose file upload or URL to start',
        })
      : screen === 'details'
        ? t('upload.screen.details.description', {
            defaultValue: 'Add details while your video is processed',
          })
        : t('upload.screen.review.description', { defaultValue: 'Review and publish your video' })

  if (!user) {
    return <div>{t('upload.loginRequired')}</div>
  }

  return (
    <>
      <Card className="mt-4 max-w-6xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{screenTitle}</span>
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">{screenDescription}</p>
        </CardHeader>

        <CardContent className="space-y-4">
          {screen === 'source' && (
            <UploadSourceScreen
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
              uploadServerCount={blossomInitalUploadServers?.length ?? 0}
              mirrorServerCount={blossomMirrorServers?.length ?? 0}
              onFileDrop={wrappedOnDrop}
              onUrlProcess={wrappedOnUrlProcess}
              onStartBackground={wrappedOnStartBackground}
              onCancelBackground={handleCancelBrowserTranscodeUpload}
              onBrowserTranscodeComplete={handleBrowserTranscodeComplete}
              onBrowserTranscodeSkip={handleBrowserTranscodeSkip}
              onConfigureServers={openBlossomOnboarding}
              onRemoveVideo={handleRemoveVideo}
              onAddAdditional={wrappedOnAddAdditional}
              onAddTranscodedVideo={handleAddTranscodedVideo}
              onStatusChange={() => {
                // DVM status no longer tracked here — use UploadManager on Review
              }}
            />
          )}

          {screen === 'details' && (
            <UploadDetailsScreen
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
              onCancelProcessing={handleCancelBrowserTranscodeUpload}
              onStartBackground={wrappedOnStartBackground}
              onBrowserTranscodeComplete={handleBrowserTranscodeComplete}
              onBrowserTranscodeSkip={handleBrowserTranscodeSkip}
            />
          )}

          {screen === 'review' && (
            <UploadReviewScreen
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
              onGoToDetails={() => setScreen('details')}
            />
          )}

          <UploadFlowFooter
            screen={screen}
            onBack={handleBack}
            onContinue={() => {
              if (screen === 'source') setScreen('details')
              else if (screen === 'details') setScreen('review')
            }}
            continueDisabled={continueDisabled}
            showContinue={showContinue}
            onSaveDraft={onBack ? handleBack : undefined}
            onDeleteDraft={onBack ? () => setShowDeleteDialog(true) : undefined}
          />
        </CardContent>
      </Card>

      {/* Upload Onboarding Dialog */}
      <UploadOnboardingDialog
        open={
          !onboardingSkipped &&
          (!blossomInitalUploadServers || blossomInitalUploadServers.length === 0)
        }
        onComplete={() => {}}
        onChooseOwn={() => openBlossomOnboarding()}
        allowSkip={betaUser}
        onSkip={() => setOnboardingSkipped(true)}
      />

      {/* Blossom Server Configuration Dialog */}
      <Dialog open={showBlossomOnboarding} onOpenChange={setShowBlossomOnboarding}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <BlossomOnboardingStep
            uploadServers={uploadServers}
            mirrorServers={mirrorServers}
            onRemoveUploadServer={url => setUploadServers(prev => prev.filter(s => s !== url))}
            onRemoveMirrorServer={url => setMirrorServers(prev => prev.filter(s => s !== url))}
            onComplete={handleBlossomOnboardingComplete}
            onOpenUploadPicker={() => setShowUploadPicker(true)}
            onOpenMirrorPicker={() => setShowMirrorPicker(true)}
            allowEmpty={betaUser}
          />
        </DialogContent>
      </Dialog>

      <BlossomServerPicker
        open={showUploadPicker}
        onOpenChange={setShowUploadPicker}
        excludeServers={uploadServers}
        onSelect={url => {
          setUploadServers(prev => [...prev, url])
          setShowUploadPicker(false)
        }}
        type="upload"
      />

      <BlossomServerPicker
        open={showMirrorPicker}
        onOpenChange={setShowMirrorPicker}
        excludeServers={mirrorServers}
        onSelect={url => {
          setMirrorServers(prev => [...prev, url])
          setShowMirrorPicker(false)
        }}
        type="mirror"
      />

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
