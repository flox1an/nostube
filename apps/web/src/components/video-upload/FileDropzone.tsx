import { useDropzone } from 'react-dropzone'
import { File } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface FileDropzoneProps {
  onDrop: (acceptedFiles: File[]) => void
  accept: Record<string, string[]>
  disabled?: boolean
  selectedFile?: File | null
  className?: string
  style?: React.CSSProperties
}

export function FileDropzone({
  onDrop,
  accept,
  disabled,
  selectedFile,
  className = '',
  style,
}: FileDropzoneProps) {
  const { t } = useTranslation()
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    multiple: false,
    disabled,
  })

  return (
    <div
      {...getRootProps()}
      style={style}
      className={
        `flex flex-col items-center h-32 justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors ` +
        (isDragActive
          ? 'border-primary bg-muted'
          : 'border-gray-300 bg-background hover:bg-muted') +
        (disabled ? ' opacity-50 cursor-not-allowed' : '') +
        ` ${className}`
      }
    >
      <input {...getInputProps()} />
      <File className="w-8 h-8 text-muted-foreground mb-2" />
      <span className="text-base text-muted-foreground">
        {isDragActive ? t('upload.dropzone.dropHere') : t('upload.dropzone.dragDrop')}
      </span>
      {selectedFile && (
        <div className="mt-2 text-sm text-foreground">
          <b>{t('upload.dropzone.selected')}:</b> {selectedFile.name} (
          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
        </div>
      )}
    </div>
  )
}
