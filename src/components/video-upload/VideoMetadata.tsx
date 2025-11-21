import { useTranslation } from 'react-i18next'

interface VideoMetadataProps {
  dimension?: string
  sizeMB?: number
  duration?: number
  videoCodec?: string
  audioCodec?: string
  inputMethod: 'file' | 'url'
}

export function VideoMetadata({
  dimension,
  sizeMB,
  duration,
  videoCodec,
  audioCodec,
  inputMethod,
}: VideoMetadataProps) {
  const { t } = useTranslation()

  return (
    <div className="mt-0 p-3 bg-muted rounded border text-sm">
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 items-center">
        <div className="text-muted-foreground">{t('upload.metadata.dimension')}</div>
        <div>
          <span className="font-mono">{dimension}</span>
        </div>
        {inputMethod === 'file' && sizeMB && (
          <>
            <div className="text-muted-foreground">{t('upload.metadata.size')}</div>
            <div>
              <span className="font-mono">{sizeMB} MB</span>
            </div>
          </>
        )}
        <div className="text-muted-foreground">{t('upload.metadata.duration')}</div>
        <div>
          <span className="font-mono">{duration} seconds</span>
        </div>
        {videoCodec && (
          <>
            <div className="text-muted-foreground">{t('upload.metadata.videoCodec')}</div>
            <div>
              <span className="font-mono">{videoCodec}</span>
            </div>
            {videoCodec.startsWith('av01') && (
              <div className="col-span-2 mt-2 text-sm text-yellow-700 bg-yellow-100 border border-yellow-300 rounded p-2">
                {t('upload.metadata.warningAv1')}
              </div>
            )}
            {videoCodec.startsWith('vp09') && (
              <div className="col-span-2 mt-2 text-sm text-yellow-700 bg-yellow-100 border border-yellow-300 rounded p-2">
                {t('upload.metadata.warningVp9')}
              </div>
            )}
            {videoCodec.startsWith('hev1') && (
              <div className="col-span-2 mt-2 text-sm text-yellow-700 bg-yellow-100 border border-yellow-300 rounded p-2">
                {t('upload.metadata.warningH265')}
              </div>
            )}
            {videoCodec.startsWith('hvc1') && (
              <div className="col-span-2 mt-2 text-sm text-blue-800 bg-blue-100 border border-blue-300 rounded p-2">
                {t('upload.metadata.infoH265hvc1')}
              </div>
            )}
            {videoCodec.startsWith('avc1') && (
              <div className="col-span-2 mt-2 text-sm text-green-800 bg-green-100 border border-green-300 rounded p-2">
                {t('upload.metadata.successH264')}
              </div>
            )}
          </>
        )}

        {audioCodec && (
          <>
            <div className="text-muted-foreground">{t('upload.metadata.audioCodec')}</div>
            <div>
              <span className="font-mono">{audioCodec}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
