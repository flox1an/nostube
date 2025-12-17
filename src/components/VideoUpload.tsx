import { useCurrentUser, useVideoUpload, useAppContext } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useSearchParams } from 'react-router-dom'
import {
  InputMethodSelector,
  UrlInputSection,
  FileDropzone,
  FormFields,
  ContentWarning,
  ThumbnailSection,
  VideoVariantsTable,
} from './video-upload'
import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { BlossomOnboardingStep } from './onboarding/BlossomOnboardingStep'
import { BlossomServerPicker } from './onboarding/BlossomServerPicker'
import { deriveServerName } from '@/lib/blossom-servers'
import type { BlossomServerTag } from '@/contexts/AppContext'

export function VideoUpload() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
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
    uploadProgress,
    blossomInitalUploadServers,
    blossomMirrorServers,
    isPublishing,
    thumbnailUrl,

    // Handlers
    handleUseRecommendedServers,
    handleAddTag,
    handlePaste,
    removeTag,
    handleUrlVideoProcessing,
    handleThumbnailDrop,
    handleThumbnailSourceChange,
    onDrop,
    handleSubmit,
    handleAddVideo,
    handleRemoveVideo,
  } = useVideoUpload()

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

  return (
    <>
      <Card className="max-w-4xl mx-auto">
        {/* Info bar above drop zone */}
        <div className="flex items-center justify-between bg-muted border border-muted-foreground/10 rounded px-4 py-2 mb-4">
          <div className="text-sm text-muted-foreground flex flex-col gap-1">
            <span>
              {t('upload.uploadInfo', {
                upload: blossomInitalUploadServers?.length ?? 0,
                mirror: blossomMirrorServers?.length ?? 0,
              })}
            </span>
            <span className="text-xs">{t('upload.tip')}</span>
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
              onClick={() => setShowBlossomOnboarding(true)}
              variant={'outline'}
              className=" cursor-pointer"
            >
              {t('upload.advanced')}
            </Button>
          </div>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          <CardContent className="flex flex-col gap-4">
            {/* Input method selection - hide after processing */}
            {uploadState === 'initial' && (
              <div className="space-y-1">
                <InputMethodSelector value={inputMethod} onChange={setInputMethod} />
                <p className="text-xs text-muted-foreground">{t('upload.quickStart')}</p>
              </div>
            )}

            {/* URL input field - hide after processing */}
            {inputMethod === 'url' && uploadState !== 'finished' && (
              <UrlInputSection
                videoUrl={videoUrl}
                onVideoUrlChange={setVideoUrl}
                onProcess={() => handleUrlVideoProcessing(videoUrl)}
                isProcessing={uploadState === 'uploading'}
              />
            )}

            {/* Video variants table */}
            {uploadInfo.videos.length > 0 ? (
              <div className="space-y-4">
                <VideoVariantsTable videos={uploadInfo.videos} onRemove={handleRemoveVideo} />
                {inputMethod === 'file' && uploadState === 'finished' && (
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
            ) : inputMethod === 'file' &&
              blossomInitalUploadServers &&
              blossomInitalUploadServers.length > 0 ? (
              <FileDropzone
                onDrop={onDrop}
                accept={{ 'video/*': [] }}
                selectedFile={file}
                className="mb-4"
                style={{
                  display: uploadInfo.videos.length > 0 ? 'none' : undefined,
                }}
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

            {uploadProgress && (
              <div className="space-y-1">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{t('upload.uploading')}</span>
                  <span>{Math.round(uploadProgress.percentage)}%</span>
                </div>
                <Progress value={uploadProgress.percentage} />
              </div>
            )}

            {/* Metadata fields - show only after video is processed/uploaded */}
            {(uploadState === 'finished' || uploadInfo.videos.length > 0) && (
              <>
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

                <ThumbnailSection
                  thumbnailSource={thumbnailSource}
                  onThumbnailSourceChange={handleThumbnailSourceChange}
                  thumbnailUrl={thumbnailUrl}
                  onThumbnailDrop={handleThumbnailDrop}
                  thumbnailUploadInfo={thumbnailUploadInfo}
                  thumbnailBlob={thumbnailBlob}
                  isThumbDragActive={false}
                />

                <ContentWarning
                  enabled={contentWarningEnabled}
                  onEnabledChange={setContentWarningEnabled}
                  reason={contentWarningReason}
                  onReasonChange={setContentWarningReason}
                />

                <div className="flex justify-end gap-2 mt-4">
                  <Button
                    type="submit"
                    disabled={
                      isPublishing || !title || !thumbnail || uploadInfo.videos.length === 0
                    }
                  >
                    {isPublishing ? t('upload.publishing') : t('upload.publishVideo')}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </form>
      </Card>

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

      {/* Blossom Server Picker Dialogs (as siblings to main dialog) */}
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
    </>
  )
}
