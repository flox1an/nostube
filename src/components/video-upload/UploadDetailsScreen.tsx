import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import type { VideoVariant } from '@/lib/video-processing'
import type { BrowserTranscodeState, SubtitleVariant, TaggedPerson } from '@/types/upload-draft'
import type { TranscodeStatus } from '@/hooks/useDvmTranscode'
import type { ChunkedUploadProgress } from '@/lib/blossom-upload'
import type { ThumbnailUploadInfo, UploadInfo } from '@/hooks/useVideoUpload'
import type { SelectedPerson } from '@/components/ui/people-picker'
import { FormFields } from './FormFields'
import { ThumbnailSection } from './ThumbnailSection'
import { SubtitleSection } from './SubtitleSection'
import { PublishDateSection } from './PublishDateSection'
import { ContentWarning } from './ContentWarning'
import { ExpirationSection } from './ExpirationSection'
import { PeoplePickerSection } from './PeoplePickerSection'
import { OriginManager } from './OriginManager'
import { ProcessingRail } from './ProcessingRail'

export interface UploadDetailsScreenProps {
  // Form fields
  title: string
  setTitle: (v: string) => void
  description: string
  setDescription: (v: string) => void
  tags: string[]
  setTags: (v: string[]) => void
  language: string
  setLanguage: (v: string) => void
  // Thumbnail
  thumbnailSource: 'generated' | 'upload'
  onThumbnailSourceChange: (v: string) => void
  thumbnailBlob: Blob | null
  onThumbnailDrop: (files: File[]) => void
  onAutoThumbnailCapture: (blob: Blob) => void
  onDeleteThumbnail: () => Promise<void>
  thumbnailUploadInfo: ThumbnailUploadInfo
  file: File | null
  videoUrl: string
  uploadInfo: UploadInfo
  // Subtitles
  subtitles: SubtitleVariant[]
  onSubtitleDrop: (files: File[]) => void
  onRemoveSubtitle: (id: string) => Promise<void>
  onSubtitleLanguageChange: (id: string, lang: string) => void
  subtitleUploading: boolean
  // Schedule & visibility
  publishAt: number | undefined
  setPublishAt: (v: number | undefined) => void
  contentWarningEnabled: boolean
  setContentWarningEnabled: (v: boolean) => void
  contentWarningReason: string
  setContentWarningReason: (v: string) => void
  expiration: 'none' | '1day' | '7days' | '1month' | '1year'
  setExpiration: (v: 'none' | '1day' | '7days' | '1month' | '1year') => void
  // Attribution
  people: TaggedPerson[]
  setPeople: (v: TaggedPerson[]) => void
  origins: string[][][]
  setOrigins: (v: string[][][]) => void
  // Processing state (VideoFilesPanel)
  draftId: string
  videos: VideoVariant[]
  uploadState: 'initial' | 'transcoding' | 'uploading' | 'finished'
  uploadProgress: ChunkedUploadProgress | null
  browserTranscodeState: BrowserTranscodeState | undefined
  deletingIndex: number | null
  hasHlsVideo: boolean
  onRemoveVideo: (index: number) => void
  onAddAdditional: (files: File[]) => void
  onAddTranscodedVideo: (video: VideoVariant) => void
  onStatusChange: (status: TranscodeStatus) => void
  onChangeSettings: () => void
  onCancelProcessing: () => void
}

export function UploadDetailsScreen({
  title,
  setTitle,
  description,
  setDescription,
  tags,
  setTags,
  language,
  setLanguage,
  thumbnailSource,
  onThumbnailSourceChange,
  thumbnailBlob,
  onThumbnailDrop,
  onAutoThumbnailCapture,
  onDeleteThumbnail,
  thumbnailUploadInfo,
  file,
  videoUrl,
  uploadInfo: _uploadInfo,
  subtitles,
  onSubtitleDrop,
  onRemoveSubtitle,
  onSubtitleLanguageChange,
  subtitleUploading,
  publishAt,
  setPublishAt,
  contentWarningEnabled,
  setContentWarningEnabled,
  contentWarningReason,
  setContentWarningReason,
  expiration,
  setExpiration,
  people,
  setPeople,
  origins,
  setOrigins,
  draftId,
  videos,
  uploadState,
  uploadProgress,
  browserTranscodeState,
  deletingIndex,
  hasHlsVideo,
  onRemoveVideo,
  onAddAdditional,
  onAddTranscodedVideo,
  onStatusChange,
  onChangeSettings,
  onCancelProcessing,
}: UploadDetailsScreenProps) {
  const { t } = useTranslation()

  // Compute video URL for thumbnail generator, revoke object URL on cleanup
  const videoUrlForThumb = useMemo(() => {
    if (file) return URL.createObjectURL(file)
    return (
      videoUrl ||
      videos[0]?.url ||
      (videos[0]?.uploadedBlobs[0] as { url?: string } | undefined)?.url ||
      undefined
    )
  }, [file, videoUrl, videos])

  useEffect(() => {
    if (!file || !videoUrlForThumb) return
    return () => URL.revokeObjectURL(videoUrlForThumb)
  }, [file, videoUrlForThumb])

  // Auto-expand accordion sections that already have data (computed once on mount)
  const defaultOpenSections = useMemo(() => {
    const open: string[] = []
    if (subtitles.length > 0) open.push('subtitles')
    if (publishAt || contentWarningEnabled || expiration !== 'none') open.push('schedule')
    if (people.length > 0 || origins.length > 0) open.push('attribution')
    return open
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: accordion defaults computed once on mount
  }, [])

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div data-slot="processing-rail">
        <ProcessingRail
          draftId={draftId}
          browserTranscodeState={browserTranscodeState}
          uploadState={uploadState}
          uploadProgress={uploadProgress}
          videos={videos}
          deletingIndex={deletingIndex}
          hasHlsVideo={hasHlsVideo}
          onCancel={onCancelProcessing}
          onChangeSettings={onChangeSettings}
          onRemoveVideo={onRemoveVideo}
          onAddAdditional={onAddAdditional}
          onAddTranscodedVideo={onAddTranscodedVideo}
          onStatusChange={onStatusChange}
        />
      </div>

      {/* Form fields: title / description / tags / language */}
      <div className="space-y-4">
        <FormFields
          title={title}
          onTitleChange={setTitle}
          description={description}
          onDescriptionChange={setDescription}
          tags={tags}
          onTagsChange={setTags}
          language={language}
          onLanguageChange={setLanguage}
        />
      </div>

      {/* Thumbnail */}
      <ThumbnailSection
        thumbnailSource={thumbnailSource}
        onThumbnailSourceChange={
          onThumbnailSourceChange as (source: 'generated' | 'upload') => void
        }
        thumbnailBlob={thumbnailBlob}
        onThumbnailDrop={onThumbnailDrop}
        onDeleteThumbnail={onDeleteThumbnail}
        isThumbDragActive={false}
        thumbnailUploadInfo={thumbnailUploadInfo}
        videoUrl={videoUrlForThumb}
        onAutoCapture={onAutoThumbnailCapture}
      />

      {/* Collapsible sections */}
      <Accordion type="multiple" defaultValue={defaultOpenSections}>
        {/* Subtitles */}
        <AccordionItem value="subtitles">
          <AccordionTrigger>
            {t('upload.subtitles.title', { defaultValue: 'Subtitles' })}
            {subtitles.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {t('upload.subtitles.count', {
                  count: subtitles.length,
                  defaultValue: `${subtitles.length} subtitle${subtitles.length === 1 ? '' : 's'}`,
                })}
              </Badge>
            )}
          </AccordionTrigger>
          <AccordionContent>
            <SubtitleSection
              subtitles={subtitles}
              onDrop={onSubtitleDrop}
              onRemove={id => {
                void onRemoveSubtitle(id)
              }}
              onLanguageChange={onSubtitleLanguageChange}
              isUploading={subtitleUploading}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Schedule & visibility */}
        <AccordionItem value="schedule">
          <AccordionTrigger>
            {t('upload.schedule.title', { defaultValue: 'Schedule & visibility' })}
            {(publishAt || contentWarningEnabled || expiration !== 'none') && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {t('upload.schedule.configured', { defaultValue: 'Configured' })}
              </Badge>
            )}
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              <PublishDateSection value={publishAt} onChange={setPublishAt} />
              <ContentWarning
                enabled={contentWarningEnabled}
                reason={contentWarningReason}
                onEnabledChange={setContentWarningEnabled}
                onReasonChange={setContentWarningReason}
              />
              <ExpirationSection value={expiration} onChange={setExpiration} />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Attribution */}
        <AccordionItem value="attribution">
          <AccordionTrigger>
            {t('upload.attribution.title', { defaultValue: 'Attribution' })}
            {people.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {t('upload.attribution.peopleCount', {
                  count: people.length,
                  defaultValue: `${people.length} person${people.length === 1 ? '' : 's'}`,
                })}
              </Badge>
            )}
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              <PeoplePickerSection
                people={people as unknown as SelectedPerson[]}
                onPeopleChange={p => setPeople(p as unknown as TaggedPerson[])}
              />
              <OriginManager origins={origins} onOriginsChange={setOrigins} />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
