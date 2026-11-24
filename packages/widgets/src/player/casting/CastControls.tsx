import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Airplay, Cast, Loader2 } from 'lucide-react'
import { ControlButton } from '../ControlButton'
import type { AirPlayState, CastError, GoogleCastControlState } from './useCasting'

interface CastButtonsProps {
  airPlay: AirPlayState
  googleCast: GoogleCastControlState
}

/** AirPlay and Google Cast buttons; each shows only while a receiver can be reached. */
export const CastButtons = memo(function CastButtons({ airPlay, googleCast }: CastButtonsProps) {
  const { t } = useTranslation()
  const device = googleCast.state.deviceName

  let castLabel = t('player.cast')
  if (googleCast.busy) castLabel = t('player.castConnecting')
  else if (googleCast.castingThis) castLabel = t('player.stopCasting')
  else if (googleCast.state.connection === 'connected')
    castLabel = device ? t('player.castTo', { device }) : t('player.cast')

  return (
    <>
      {airPlay.available && (
        <ControlButton
          onClick={airPlay.showPicker}
          icon={<Airplay className="w-5 h-5" />}
          label={t('player.airplay')}
          active={airPlay.active}
        />
      )}
      {googleCast.available && (
        <ControlButton
          onClick={googleCast.castingThis ? googleCast.stop : googleCast.start}
          disabled={googleCast.busy}
          icon={
            googleCast.busy ? (
              <Loader2 className="w-5 h-5 animate-spin motion-reduce:animate-none" />
            ) : (
              <Cast className="w-5 h-5" />
            )
          }
          label={castLabel}
          active={googleCast.castingThis}
        />
      )}
    </>
  )
})

interface CastingOverlayProps {
  deviceName?: string
  buffering: boolean
  poster?: string | null
}

/** Covers the paused local video while a Google Cast receiver plays it. */
export const CastingOverlay = memo(function CastingOverlay({
  deviceName,
  buffering,
  poster,
}: CastingOverlayProps) {
  const { t } = useTranslation()
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black pointer-events-none">
      {poster && (
        <img
          src={poster}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
      )}
      <div
        className="relative flex flex-col items-center gap-3 px-6 text-center text-white"
        role="status"
      >
        <Cast className="h-10 w-10 text-primary" aria-hidden="true" />
        <p className="text-base font-semibold sm:text-lg text-balance">
          {deviceName ? t('player.castingOn', { device: deviceName }) : t('player.castingOnDevice')}
        </p>
        {buffering && (
          <Loader2
            className="h-5 w-5 animate-spin text-white/80 motion-reduce:animate-none"
            aria-label={t('player.castConnecting')}
          />
        )}
      </div>
    </div>
  )
})

/** A short notice above the controls; local playback goes on underneath. */
export const CastErrorNotice = memo(function CastErrorNotice({ error }: { error: CastError }) {
  const { t } = useTranslation()
  const message = {
    connect: t('player.castErrorConnect'),
    load: t('player.castErrorLoad'),
    playback: t('player.castErrorPlayback'),
  }[error]
  return (
    <div className="absolute inset-x-0 top-3 z-30 flex justify-center px-3 pointer-events-none">
      <p
        role="alert"
        className="max-w-md rounded-lg bg-black/85 px-4 py-2 text-center text-sm text-white shadow-lg shadow-black/40"
      >
        {message}
      </p>
    </div>
  )
})
