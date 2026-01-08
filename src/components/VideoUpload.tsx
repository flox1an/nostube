import { useCurrentUser, useVideoUpload, useAppContext } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  InputMethodSelector,
  UrlInputSection,
  FileDropzone,
  FormFields,
  ContentWarning,
  ThumbnailSection,
  ExpirationSection,
  DvmTranscodeAlert,
  EventPreview,
  SubtitleSection,
} from './video-upload'
import { DeleteVideoDialog } from './video-upload/DeleteVideoDialog'
import type { TranscodeStatus } from '@/hooks/useDvmTranscode'
import { VideoVariantsTable } from './video-upload/VideoVariantsTable'
import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { BlossomOnboardingStep } from './onboarding/BlossomOnboardingStep'
import { BlossomServerPicker } from './onboarding/BlossomServerPicker'
import { deriveServerName } from '@/lib/blossom-servers'
import { generateEventLink } from '@/lib/nostr'
import type { BlossomServerTag } from '@/contexts/AppContext'
import type { UploadDraft } from '@/types/upload-draft'
import { useUploadDrafts } from '@/hooks/useUploadDrafts'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface UploadFormProps {
  draft: UploadDraft
  onBack?: () => void
}

export function VideoUpload({ draft, onBack }: UploadFormProps) {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const { updateDraft, deleteDraft } = useUploadDrafts()

  const handleDraftChange = useCallback(
    (updates: Partial<UploadDraft>) => {
      updateDraft(draft.id, updates)
    },
    [draft.id, updateDraft]
  )

  const videoUploadState = useVideoUpload(draft, handleDraftChange)
  const {
    // State
    title,
    setTitle,
    description,
    setDescription,
    tags,
    tagInput,
    setTagInput,
    language,
    setLanguage,
    inputMethod,
    setInputMethod,
    videoUrl,
    setVideoUrl,
    file,
    thumbnail,
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
    uploadProgress,
    blossomInitalUploadServers,
    blossomMirrorServers,
    isPublishing,
    thumbnailUrl,
    previewEvent,
    videoToDelete,
    setVideoToDelete,
    subtitles,
    subtitleUploading,

    // Handlers
    handleUseRecommendedServers,
    handleAddTag,
    handlePaste,
    removeTag,
    handleUrlVideoProcessing,
    handleThumbnailDrop,
    handleThumbnailSourceChange,
    handleDeleteThumbnail,
    onDrop,
    handleSubmit: originalHandleSubmit,
    handleAddVideo,
    handleRemoveVideo,
    handleRemoveVideoFromFormOnly,
    handleRemoveVideoWithBlobs,
    handleSubtitleDrop,
    handleRemoveSubtitle,
    handleSubtitleLanguageChange,
  } = videoUploadState

  // Handle back button - save current state before navigating
  const handleBack = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('[VideoUpload] handleBack - saving draft with title:', title)
    }
    // Explicitly save current form state
    handleDraftChange({
      title,
      description,
      tags,
      language,
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
      thumbnailSource,
      updatedAt: Date.now(),
    })
    // Navigate back after microtask to ensure state updates propagate
    if (onBack) {
      // Use queueMicrotask to ensure the save completes and version increments
      // before we navigate away
      queueMicrotask(() => {
        if (import.meta.env.DEV) {
          console.log('[VideoUpload] handleBack - navigating back')
        }
        onBack()
      })
    }
  }, [
    handleDraftChange,
    title,
    description,
    tags,
    language,
    inputMethod,
    videoUrl,
    uploadInfo,
    thumbnailUploadInfo,
    subtitles,
    contentWarningEnabled,
    contentWarningReason,
    expiration,
    thumbnailSource,
    onBack,
  ])

  // Wrap handleSubmit to delete draft on success and navigate to video page
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Only allow publishing from step 5
    if (currentStep !== 5) {
      if (import.meta.env.DEV) {
        console.warn(
          '[VideoUpload] Form submission blocked: currentStep is',
          currentStep,
          'but must be 5 to publish. This may indicate an unexpected Enter key press or HMR issue.'
        )
      }
      return
    }

    // Prevent accidental submit right after arriving at step 5
    if (justArrivedAtStep5) {
      if (import.meta.env.DEV) {
        console.warn(
          '[VideoUpload] Form submission blocked: just arrived at step 5, preventing double-click publish'
        )
      }
      return
    }

    if (import.meta.env.DEV) {
      console.log('[VideoUpload] Publishing video from step 5, title:', title)
    }

    try {
      const publishedEvent = await originalHandleSubmit(e)
      if (publishedEvent) {
        // On success, delete the draft
        deleteDraft(draft.id)
        // Navigate to the video page
        const eventLink = generateEventLink(publishedEvent, publishedEvent.identifier)
        navigate(`/video/${eventLink}`)
      }
    } catch (error) {
      // Keep draft on error
      console.error('Publish failed:', error)
    }
  }

  // Dropzone for adding additional videos
  const onDropAdditional = useCallback(
    (acceptedFiles: File[]) => {
      handleAddVideo(acceptedFiles)
    },
    [handleAddVideo]
  )

  const { getRootProps: getRootPropsAdditional, getInputProps: getInputPropsAdditional } =
    useDropzone({
      onDrop: onDropAdditional,
      accept: { 'video/*': [] },
      multiple: false,
    })

  const { user } = useCurrentUser()
  const { config, updateConfig } = useAppContext()
  const [showBlossomOnboarding, setShowBlossomOnboarding] = useState(false)
  const [showUploadPicker, setShowUploadPicker] = useState(false)
  const [showMirrorPicker, setShowMirrorPicker] = useState(false)
  const [currentStep, setCurrentStep] = useState(1) // 1: Video Upload, 2: Form, 3: Thumbnail
  const [transcodeStatus, setTranscodeStatus] = useState<TranscodeStatus>('idle')
  const [justArrivedAtStep5, setJustArrivedAtStep5] = useState(false)

  // Initialize with existing configured servers
  const [uploadServers, setUploadServers] = useState<string[]>(() => {
    return (
      config.blossomServers?.filter(s => s.tags.includes('initial upload')).map(s => s.url) || []
    )
  })
  const [mirrorServers, setMirrorServers] = useState<string[]>(() => {
    return config.blossomServers?.filter(s => s.tags.includes('mirror')).map(s => s.url) || []
  })

  // Handlers for server management
  const handleBlossomOnboardingComplete = () => {
    // Save to config
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
  }

  const handleAddUploadServer = (url: string) => {
    setUploadServers(prev => [...prev, url])
    setShowUploadPicker(false)
  }

  const handleAddMirrorServer = (url: string) => {
    setMirrorServers(prev => [...prev, url])
    setShowMirrorPicker(false)
  }

  const handleRemoveUploadServer = (url: string) => {
    setUploadServers(prev => prev.filter(s => s !== url))
  }

  const handleRemoveMirrorServer = (url: string) => {
    setMirrorServers(prev => prev.filter(s => s !== url))
  }

  // Handle URL and description prefilling from query params (e.g., /upload?url=...&description=...)
  useEffect(() => {
    const urlParam = searchParams.get('url')
    const descriptionParam = searchParams.get('description')

    if (urlParam && urlParam.trim() && videoUrl !== urlParam) {
      setInputMethod('url')
      setVideoUrl(urlParam)
      // Auto-process the URL
      handleUrlVideoProcessing(urlParam)
    }

    // Prefill description if provided
    if (descriptionParam && descriptionParam.trim() && description !== descriptionParam) {
      setDescription(descriptionParam)
    }
  }, [
    searchParams,
    videoUrl,
    description,
    setInputMethod,
    setVideoUrl,
    setDescription,
    handleUrlVideoProcessing,
  ])

  if (!user) {
    return <div>{t('upload.loginRequired')}</div>
  }

  // Validation for each step
  const canProceedToStep2 = uploadInfo.videos.length > 0
  const canProceedToStep3 = title.trim().length > 0
  const hasUploadedThumbnail = thumbnailUploadInfo.uploadedBlobs.length > 0
  const canProceedToStep4 =
    thumbnailSource === 'generated' ? thumbnailBlob : thumbnail || hasUploadedThumbnail
  const isTranscoding = transcodeStatus === 'transcoding' || transcodeStatus === 'mirroring'
  const canPublish =
    uploadInfo.videos.length > 0 &&
    title.trim().length > 0 &&
    (thumbnailSource === 'generated' ? thumbnailBlob : thumbnail || hasUploadedThumbnail) &&
    !isTranscoding

  return (
    <>
      <Card className="mt-4 max-w-6xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>
              {currentStep === 1 && t('upload.step1.title', { defaultValue: 'Upload Video' })}
              {currentStep === 2 && t('upload.step2.title', { defaultValue: 'Video Details' })}
              {currentStep === 3 && t('upload.step3.title', { defaultValue: 'Thumbnail' })}
              {currentStep === 4 && t('upload.step4.title', { defaultValue: 'Subtitles' })}
              {currentStep === 5 &&
                t('upload.step5.title', { defaultValue: 'Additional Settings' })}
            </span>
            <span className="text-sm text-muted-foreground font-normal">
              {t('upload.stepIndicator', { current: currentStep, total: 5 })}
            </span>
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            {currentStep === 1 &&
              t('upload.step1.description', {
                defaultValue: 'Upload at least one video to continue',
              })}
            {currentStep === 2 &&
              t('upload.step2.description', {
                defaultValue: 'Fill in the required fields (* indicates required)',
              })}
            {currentStep === 3 &&
              t('upload.step3.description', {
                defaultValue: 'Select or upload a thumbnail for your video',
              })}
            {currentStep === 4 &&
              t('upload.step4.description', {
                defaultValue: 'Add subtitle files for accessibility (optional)',
              })}
            {currentStep === 5 &&
              t('upload.step5.description', {
                defaultValue: 'Configure optional settings for your video',
              })}
          </p>
        </CardHeader>

        <form onSubmit={handleSubmit} noValidate>
          <CardContent className="space-y-4">
            {/* Step 1: Video Upload */}
            {currentStep === 1 && (
              <div className="space-y-4">
                {/* Info bar */}
                <div className="flex items-center justify-between bg-muted border border-muted-foreground/10 rounded px-4 py-2">
                  <div className="text-sm text-muted-foreground flex flex-col gap-1">
                    <span>
                      {t('upload.uploadInfo', {
                        upload: blossomInitalUploadServers?.length ?? 0,
                        mirror: blossomMirrorServers?.length ?? 0,
                      })}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {(!blossomInitalUploadServers || blossomInitalUploadServers.length === 0) && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleUseRecommendedServers}
                        className="cursor-pointer"
                      >
                        {t('upload.useRecommended')}
                      </Button>
                    )}
                    <Button
                      type="button"
                      onClick={() => setShowBlossomOnboarding(true)}
                      variant={'outline'}
                      className="cursor-pointer"
                    >
                      {t('upload.advanced')}
                    </Button>
                  </div>
                </div>

                {/* Input method selection */}
                {uploadState === 'initial' && (
                  <InputMethodSelector value={inputMethod} onChange={setInputMethod} />
                )}

                {/* URL input field */}
                {inputMethod === 'url' && uploadState !== 'finished' && (
                  <UrlInputSection
                    videoUrl={videoUrl}
                    onVideoUrlChange={setVideoUrl}
                    onProcess={() => handleUrlVideoProcessing(videoUrl)}
                    isProcessing={uploadState === 'uploading'}
                  />
                )}

                {/* File upload */}
                {uploadInfo.videos.length > 0 ? null : inputMethod === 'file' &&
                  blossomInitalUploadServers &&
                  blossomInitalUploadServers.length > 0 ? (
                  <FileDropzone
                    onDrop={onDrop}
                    accept={{ 'video/*': [] }}
                    selectedFile={file}
                    className="mb-4"
                  />
                ) : inputMethod === 'file' ? (
                  <div className="text-sm text-muted-foreground bg-yellow-50 border border-yellow-200 rounded p-3 mb-2">
                    <span>
                      {t('upload.noUploadServers')}
                      <br />
                      {t('upload.configureServers')}
                    </span>
                  </div>
                ) : null}

                {/* Upload progress */}
                {uploadProgress && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{t('upload.uploading')}</span>
                      <span>{Math.round(uploadProgress.percentage)}%</span>
                    </div>
                    <Progress value={uploadProgress.percentage} />
                  </div>
                )}

                {/* Video variants table */}
                {uploadInfo.videos.length > 0 && (
                  <div className="space-y-4">
                    <VideoVariantsTable videos={uploadInfo.videos} onRemove={handleRemoveVideo} />

                    {/* DVM Transcode Alert - shown for high-res or incompatible videos */}
                    {(uploadState === 'finished' && uploadInfo.videos[0]) ||
                    draft.dvmTranscodeState ? (
                      <DvmTranscodeAlert
                        draftId={draft.id}
                        video={uploadInfo.videos[0]}
                        existingResolutions={uploadInfo.videos
                          .map(v => v.qualityLabel)
                          .filter((label): label is string => !!label)}
                        onComplete={videoUploadState.handleAddTranscodedVideo}
                        onStatusChange={setTranscodeStatus}
                        initialTranscodeState={draft.dvmTranscodeState}
                      />
                    ) : null}

                    {/* Add another quality button */}
                    {uploadState === 'finished' && (
                      <div className="border-2 border-dashed rounded-lg p-4">
                        <div
                          {...getRootPropsAdditional()}
                          className="flex flex-col items-center justify-center gap-2 cursor-pointer py-4"
                        >
                          <input {...getInputPropsAdditional()} />
                          <Button type="button" variant="outline" className="cursor-pointer">
                            {t('upload.addAnotherQuality')}
                          </Button>
                          <p className="text-xs text-muted-foreground text-center">
                            {t('upload.addAnotherQualityHint')}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Form Fields */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <FormFields
                  title={title}
                  onTitleChange={setTitle}
                  description={description}
                  onDescriptionChange={setDescription}
                  tags={tags}
                  tagInput={tagInput}
                  onTagInputChange={setTagInput}
                  onAddTag={handleAddTag}
                  onPaste={handlePaste}
                  onRemoveTag={removeTag}
                  onTagInputBlur={() => {}}
                  language={language}
                  onLanguageChange={setLanguage}
                />
              </div>
            )}

            {/* Step 3: Thumbnail */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <ThumbnailSection
                  thumbnailSource={thumbnailSource}
                  onThumbnailSourceChange={handleThumbnailSourceChange}
                  thumbnailUrl={thumbnailUrl}
                  onThumbnailDrop={handleThumbnailDrop}
                  onDeleteThumbnail={handleDeleteThumbnail}
                  thumbnailUploadInfo={thumbnailUploadInfo}
                  thumbnailBlob={thumbnailBlob}
                  isThumbDragActive={false}
                />
              </div>
            )}

            {/* Step 4: Subtitles */}
            {currentStep === 4 && (
              <div className="space-y-4">
                <SubtitleSection
                  subtitles={subtitles}
                  onDrop={handleSubtitleDrop}
                  onRemove={handleRemoveSubtitle}
                  onLanguageChange={handleSubtitleLanguageChange}
                  isUploading={subtitleUploading}
                />
              </div>
            )}

            {/* Step 5: Additional Settings */}
            {currentStep === 5 && (
              <div className="space-y-4">
                <ContentWarning
                  enabled={contentWarningEnabled}
                  onEnabledChange={setContentWarningEnabled}
                  reason={contentWarningReason}
                  onReasonChange={setContentWarningReason}
                />

                <ExpirationSection value={expiration} onChange={setExpiration} />
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex justify-between pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
                disabled={currentStep === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                {t('upload.previous', { defaultValue: 'Previous' })}
              </Button>

              <div className="flex gap-2">
                {onBack && (
                  <Button type="button" variant="secondary" onClick={handleBack}>
                    {t('upload.draft.saveDraft', { defaultValue: 'Save Draft' })}
                  </Button>
                )}

                {currentStep < 5 ? (
                  <Button
                    type="button"
                    onClick={() => {
                      const nextStep = Math.min(5, currentStep + 1)
                      if (nextStep === 5) {
                        // Prevent accidental double-click from triggering publish
                        setJustArrivedAtStep5(true)
                        setTimeout(() => setJustArrivedAtStep5(false), 500)
                      }
                      setCurrentStep(nextStep)
                    }}
                    disabled={
                      (currentStep === 1 && !canProceedToStep2) ||
                      (currentStep === 2 && !canProceedToStep3) ||
                      (currentStep === 3 && !canProceedToStep4)
                      // Step 4 (Subtitles) is optional - always can proceed
                    }
                  >
                    {t('upload.next', { defaultValue: 'Next' })}
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={isPublishing || !canPublish || justArrivedAtStep5}
                  >
                    {isPublishing ? t('upload.publishing') : t('upload.publishVideo')}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </form>
      </Card>

      {/* Event Preview - collapsible section showing the generated Nostr event */}
      <div className="max-w-6xl mx-auto">
        <EventPreview event={previewEvent} />
      </div>

      {/* Blossom Server Configuration Dialog */}
      <Dialog open={showBlossomOnboarding} onOpenChange={setShowBlossomOnboarding}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <BlossomOnboardingStep
            uploadServers={uploadServers}
            mirrorServers={mirrorServers}
            onRemoveUploadServer={handleRemoveUploadServer}
            onRemoveMirrorServer={handleRemoveMirrorServer}
            onComplete={handleBlossomOnboardingComplete}
            onOpenUploadPicker={() => setShowUploadPicker(true)}
            onOpenMirrorPicker={() => setShowMirrorPicker(true)}
          />
        </DialogContent>
      </Dialog>

      {/* Blossom Server Picker Dialogs */}
      <BlossomServerPicker
        open={showUploadPicker}
        onOpenChange={setShowUploadPicker}
        excludeServers={uploadServers}
        onSelect={handleAddUploadServer}
        type="upload"
      />

      <BlossomServerPicker
        open={showMirrorPicker}
        onOpenChange={setShowMirrorPicker}
        excludeServers={mirrorServers}
        onSelect={handleAddMirrorServer}
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
    </>
  )
}
