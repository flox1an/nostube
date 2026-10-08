import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, Loader2 } from 'lucide-react'
import type { Signer } from '@/lib/blossom-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  useAppContext,
  useCurrentUser,
  useProfile,
  useProfilePublish,
  useUserBlossomServers,
} from '@/hooks'
import { useFileUpload } from '@/hooks/useFileUpload'
import { DEFAULT_MIRROR_SERVERS, DEFAULT_UPLOAD_SERVERS } from '@/lib/blossom-servers'
import { toast } from 'sonner'

interface PhaseProfileStepProps {
  onComplete: () => void
  onSkip: () => void
}

export function PhaseProfileStep({ onComplete, onSkip }: PhaseProfileStepProps) {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const { config } = useAppContext()
  const metadata = useProfile(user?.pubkey ? { pubkey: user.pubkey } : undefined)
  const { publishProfile, isPending } = useProfilePublish()
  const { data: userBlossomServers } = useUserBlossomServers()
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ name: '', about: '', picture: '' })
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const configInitialServers =
    config.blossomServers
      ?.filter(server => server.tags.includes('initial upload'))
      .map(server => server.url) || []
  const configMirrorServers =
    config.blossomServers
      ?.filter(server => server.tags.includes('mirror'))
      .map(server => server.url) || []
  const initialServers = configInitialServers.length
    ? configInitialServers
    : userBlossomServers.slice(0, 1).concat(userBlossomServers.length ? [] : DEFAULT_UPLOAD_SERVERS)
  const mirrorServers = configMirrorServers.length
    ? configMirrorServers
    : userBlossomServers
        .filter(server => !initialServers.includes(server))
        .concat(userBlossomServers.length ? [] : DEFAULT_MIRROR_SERVERS)
  const canUpload = !!user && initialServers.length > 0
  const signer = user
    ? ((async draft => user.signer.signEvent(draft)) as Signer)
    : ((async draft => draft) as Signer)
  const {
    upload,
    progress: fileUploadProgress,
    uploading: isFileUploading,
    reset: resetFileUpload,
  } = useFileUpload({ initialServers, mirrorServers, signer })

  useEffect(() => {
    setForm({
      name: metadata?.display_name || metadata?.displayName || metadata?.name || '',
      about: metadata?.about || '',
      picture: metadata?.picture || '',
    })
    setFieldError(null)
    setUploading(false)
    resetFileUpload()
  }, [metadata, resetFileUpload])

  const fallbackPicture = '/onboarding/identity-spot.webp'
  const isSaving = isPending || uploading || isFileUploading
  const name = form.name.trim()

  const handleImageUpload = async (file?: File) => {
    if (!file || !user) return
    if (!file.type.startsWith('image/')) {
      setFieldError(t('onboarding.profileStep.imageOnly'))
      return
    }
    if (!canUpload) {
      setFieldError(t('onboarding.profileStep.noBlossomServers'))
      return
    }

    setUploading(true)
    setFieldError(null)
    try {
      const { uploadedBlobs } = await upload(file)
      const primaryBlob = uploadedBlobs[0]
      if (!primaryBlob?.url) throw new Error('No uploaded image URL returned')

      setForm(current => ({ ...current, picture: primaryBlob.url }))
      toast.success(t('onboarding.profileStep.imageUploaded'))
    } catch (error) {
      setFieldError(error instanceof Error ? error.message : String(error))
      toast.error(t('onboarding.profileStep.imageUploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (!user?.pubkey) return
    if (!name) {
      setFieldError(t('onboarding.profileStep.nameRequired'))
      return
    }

    const nextProfile: Record<string, unknown> = { ...(metadata || {}) }
    nextProfile.name = name
    nextProfile.display_name = name
    nextProfile.displayName = name
    nextProfile.about = form.about.trim()
    nextProfile.picture = form.picture.trim()

    try {
      await publishProfile(nextProfile)
      toast.success(t('onboarding.profileStep.profileSaved'))
      onComplete()
    } catch (error) {
      setFieldError(error instanceof Error ? error.message : String(error))
      toast.error(t('onboarding.profileStep.profileSaveFailed'))
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <button
          type="button"
          className="group relative h-24 w-24 overflow-hidden rounded-full border-4 border-background bg-muted shadow-sm"
          onClick={() => avatarInputRef.current?.click()}
          disabled={isSaving}
        >
          {form.picture || fallbackPicture ? (
            <img
              src={form.picture || fallbackPicture}
              alt=""
              className="h-full w-full object-cover"
              onError={event => {
                if (fallbackPicture) event.currentTarget.src = fallbackPicture
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <Camera className="h-7 w-7" />
            </div>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-white opacity-0 transition-opacity group-hover:opacity-100">
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Camera className="h-5 w-5" />
            )}
          </span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => avatarInputRef.current?.click()}
          disabled={isSaving}
        >
          {t('onboarding.profileStep.avatarLabel')}
        </Button>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={event => handleImageUpload(event.target.files?.[0])}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="onboarding-profile-name">{t('onboarding.profileStep.nameLabel')}</Label>
        <Input
          id="onboarding-profile-name"
          value={form.name}
          placeholder={t('onboarding.profileStep.namePlaceholder')}
          onChange={event => {
            setFieldError(null)
            setForm(current => ({ ...current, name: event.target.value }))
          }}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="onboarding-profile-about">{t('onboarding.profileStep.aboutLabel')}</Label>
        <Textarea
          id="onboarding-profile-about"
          value={form.about}
          className="min-h-24"
          placeholder={t('onboarding.profileStep.aboutPlaceholder')}
          onChange={event => {
            setFieldError(null)
            setForm(current => ({ ...current, about: event.target.value }))
          }}
        />
      </div>

      {uploading && fileUploadProgress && (
        <div className="text-sm text-muted-foreground">
          {t('onboarding.profileStep.uploadingImage')} {Math.round(fileUploadProgress.percentage)}%
        </div>
      )}
      {fieldError && <div className="text-sm text-destructive">{fieldError}</div>}

      <div className="flex gap-2">
        <Button variant="outline" onClick={onSkip} disabled={isSaving} className="flex-1">
          {t('onboarding.profileStep.skip')}
        </Button>
        <Button onClick={handleSave} disabled={isSaving} className="flex-1">
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSaving ? t('onboarding.profileStep.saving') : t('onboarding.profileStep.continue')}
        </Button>
      </div>
    </div>
  )
}
