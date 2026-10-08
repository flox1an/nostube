import { useDropzone } from 'react-dropzone'
import { FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SubtitleVariant } from '@/types/upload-draft'
import { SubtitlesTable } from './SubtitlesTable'

interface SubtitleSectionProps {
  subtitles: SubtitleVariant[]
  onDrop: (acceptedFiles: File[]) => void
  onRemove: (id: string) => void
  onLanguageChange: (id: string, lang: string) => void
  isUploading?: boolean
}

export function SubtitleSection({
  subtitles,
  onDrop,
  onRemove,
  onLanguageChange,
  isUploading = false,
}: SubtitleSectionProps) {
  const { t } = useTranslation()

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/vtt': ['.vtt'],
      'application/x-subrip': ['.srt'],
      'text/plain': ['.vtt', '.srt'],
    },
    multiple: true,
    disabled: isUploading,
  })

  return (
    <div className="space-y-4">
      {/* Subtitle table */}
      {subtitles.length > 0 && (
        <SubtitlesTable
          subtitles={subtitles}
          onRemove={onRemove}
          onLanguageChange={onLanguageChange}
        />
      )}

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={
          `flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors ` +
          (isDragActive
            ? 'border-primary bg-muted'
            : 'border-gray-300 bg-background hover:bg-muted') +
          (isUploading ? ' opacity-50 cursor-not-allowed' : '')
        }
      >
        <input {...getInputProps()} />
        <FileText className="w-8 h-8 text-muted-foreground mb-2" />
        <span className="text-base text-muted-foreground text-center">
          {isDragActive
            ? t('upload.subtitles.dropHere', { defaultValue: 'Drop subtitle files here...' })
            : t('upload.subtitles.dragDrop', {
                defaultValue: 'Drag & drop VTT or SRT files here, or click to select',
              })}
        </span>
        <span className="text-xs text-muted-foreground mt-1">
          {t('upload.subtitles.optional', { defaultValue: '(Optional)' })}
        </span>
      </div>

      {/* Helper text */}
      {subtitles.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('upload.subtitles.helperText', {
            defaultValue:
              'Add subtitle files to make your video accessible in multiple languages. Language is auto-detected from filename (e.g., video_en.vtt).',
          })}
        </p>
      )}

      {/* Warning for subtitles without language */}
      {subtitles.some(s => !s.lang) && (
        <p className="text-sm text-amber-600">
          {t('upload.subtitles.noLanguageWarning', {
            defaultValue:
              'Some subtitles have no language selected. Please select a language for each subtitle.',
          })}
        </p>
      )}
    </div>
  )
}
