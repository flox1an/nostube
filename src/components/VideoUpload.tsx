import { useCurrentUser, useVideoUpload } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
import { useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'

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
  const navigate = useNavigate()

  // Handle URL prefilling from query params (e.g., /upload?url=...)
  useEffect(() => {
    const urlParam = searchParams.get('url')
    if (urlParam && urlParam.trim() && videoUrl !== urlParam) {
      setInputMethod('url')
      setVideoUrl(urlParam)
      // Auto-process the URL
      handleUrlVideoProcessing(urlParam)
    }
  }, [searchParams, videoUrl, setInputMethod, setVideoUrl, handleUrlVideoProcessing])

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
              onClick={() => navigate('/settings')}
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
    </>
  )
}
