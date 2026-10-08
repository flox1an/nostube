import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ToastAction } from '@/components/ui/toast'
import { useToast } from './useToast'
import { useMutedPubkeys } from './useMutedPubkeys'

/**
 * Mute or unmute a single account with the toast + undo affordance every
 * surface shares. Publishing can fail (signer rejected, no relay accepted the
 * list), so the error toast is part of the shared flow rather than each caller.
 */
export function useMuteUser(pubkey: string) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { mutedPubkeys, mutePubkey, unmutePubkey } = useMutedPubkeys()

  const isMuted = mutedPubkeys.includes(pubkey)

  const toggleMute = useCallback(async () => {
    try {
      if (isMuted) {
        await unmutePubkey(pubkey)
        toast({ title: t('mute.userUnmuted', { defaultValue: 'User unmuted' }) })
        return
      }

      await mutePubkey(pubkey)
      const undo = t('common.undo', { defaultValue: 'Undo' })
      toast({
        title: t('video.comments.userMuted'),
        action: (
          <ToastAction altText={undo} onClick={() => void unmutePubkey(pubkey)}>
            {undo}
          </ToastAction>
        ),
      })
    } catch (error) {
      console.error('Failed to update mute list:', error)
      toast({
        title: t('mute.error', { defaultValue: 'Could not update your mute list' }),
        variant: 'destructive',
      })
    }
  }, [isMuted, pubkey, mutePubkey, unmutePubkey, toast, t])

  return { isMuted, toggleMute }
}
