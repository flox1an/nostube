import { useEffect, useRef, useState } from 'react'
import { BadgeCheck, Camera, Minus, Plus, Loader2, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@nostube/widgets/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nostube/widgets/components/dialog'
import { Input } from '@nostube/widgets/components/input'
import { Label } from '@nostube/widgets/components/label'
import { Textarea } from '@nostube/widgets/components/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@nostube/widgets/components/tooltip'
import { RichTextContent } from '@/components/RichTextContent'
import { ZapButton } from '@/components/ZapButton'
import { UserActionsMenu } from '@/components/UserActionsMenu'
import {
  useProfile,
  useAppContext,
  useCurrentUser,
  useFollowSet,
  useUserRelays,
  useProfilePublish,
  useUserBlossomServers,
} from '@/hooks'
import { useFileUpload } from '@/hooks/useFileUpload'
import { hasLightningAddress } from '@nostube/core/zap-utils'
import { displayNip05, verifyNip05 } from '@nostube/core/nip05'
import { toast } from 'sonner'
import type { Signer } from '@/lib/blossom-auth'
import type { ReactNode } from 'react'
import { DEFAULT_MIRROR_SERVERS, DEFAULT_UPLOAD_SERVERS } from '@/lib/blossom-servers'
import { useImageCascade } from '@nostube/widgets/hooks/useImageCascade'
import { Avatar, AvatarImage, AvatarFallback } from '@nostube/widgets/components/avatar'
import { useTranslation } from 'react-i18next'
import { TrustBadgeDisplay } from '@/components/TrustBadge'
import { useTrustScoreDetail } from '@/hooks/useTrustScore'
import { avatarFallbackUrl, TAP_TARGET } from '@/components/author/shared'

type EditableProfile = Record<string, unknown> & {
  name?: string
  display_name?: string
  displayName?: string
  about?: string
  website?: string
  nip05?: string
  lud06?: string
  lud16?: string
  picture?: string
  banner?: string
}

/** Banner pair for the page header: hidden preloader plus the visible display. */
export function AuthorBanner({
  pubkey,
  onLoad,
  onError,
}: {
  pubkey: string
  onLoad: () => void
  onError: () => void
}) {
  const metadata = useProfile({ pubkey })
  const banner = metadata?.banner
  const cascade = useImageCascade({ src: banner, variant: 'preview', authorPubkey: pubkey })

  if (!cascade.src) return null

  return (
    <img
      src={cascade.src}
      alt=""
      className="hidden"
      onLoad={() => {
        cascade.onLoad()
        onLoad()
      }}
      onError={() => {
        if (cascade.stage === 'raw') onError()
        cascade.onError()
      }}
    />
  )
}

export function AuthorBannerDisplay({ banner, pubkey }: { banner: string; pubkey: string }) {
  const cascade = useImageCascade({ src: banner, variant: 'preview', authorPubkey: pubkey })
  if (!cascade.src) return null

  return (
    // Edge to edge on mobile (the page has no padding below sm), so no rounded corners there.
    <div className="relative w-full h-32 sm:h-48 md:h-56 overflow-hidden sm:rounded-lg">
      <img
        src={cascade.src}
        alt=""
        className="w-full h-full object-cover"
        onError={cascade.onError}
        onLoad={cascade.onLoad}
      />
      {/* Gradient fade to background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-40% to-background" />
    </div>
  )
}

export function ProfileCard({
  pubkey,
  hasBanner,
  className = '',
}: {
  pubkey: string
  hasBanner: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const [isEditOpen, setIsEditOpen] = useState(false)
  const metadata = useProfile({ pubkey })
  const { result: trustScore } = useTrustScoreDetail(pubkey)
  const displayName = metadata?.display_name ?? metadata?.name ?? pubkey?.slice(0, 8) ?? pubkey
  const picture = metadata?.picture
  const profilePicture = useImageCascade({ src: picture, variant: 'avatar', authorPubkey: pubkey })
  const [isAboutExpanded, setIsAboutExpanded] = useState(false)
  const [isAboutClamped, setIsAboutClamped] = useState(false)
  const aboutRef = useRef<HTMLDivElement>(null)

  const isOwnProfile = user?.pubkey === pubkey
  const canZap = !!user && !isOwnProfile && hasLightningAddress(metadata)

  // Follow state
  const { followedPubkeys, addFollow, removeFollow, isLoading: isFollowLoading } = useFollowSet()
  const isFollowing = followedPubkeys.includes(pubkey)
  const canFollow = !!user && !isOwnProfile

  // Get author's outbox relays for relay hint
  const { data: authorRelays } = useUserRelays(pubkey)
  const outboxRelay = authorRelays.find(r => r.write)?.url

  const handleFollowClick = async () => {
    if (isFollowing) {
      await removeFollow(pubkey)
    } else {
      await addFollow(pubkey, outboxRelay)
    }
  }

  // Check if about text is clamped (overflows 3 lines)
  useEffect(() => {
    const el = aboutRef.current
    if (el) {
      setIsAboutClamped(el.scrollHeight > el.clientHeight)
    }
  }, [metadata?.about])

  // NIP-05 is checked only here, once per page view; other places show it unverified.
  const nip05 = typeof metadata?.nip05 === 'string' ? metadata.nip05 : undefined
  const [verified, setVerified] = useState<string>()
  useEffect(() => {
    if (!nip05) return
    let cancelled = false
    verifyNip05(nip05, pubkey).then(ok => {
      if (ok && !cancelled) setVerified(`${pubkey} ${nip05}`)
    })
    return () => {
      cancelled = true
    }
  }, [nip05, pubkey])
  const verifiedLabel =
    nip05 && verified === `${pubkey} ${nip05}`
      ? t('pages.author.nip05Verified', { nip05: displayNip05(nip05) })
      : undefined

  const actionClass = cn('bg-white/10 backdrop-blur-md hover:bg-white/30', TAP_TARGET)

  return (
    <div className={cn('relative', hasBanner && '-mt-14 sm:-mt-20 sm:ml-6', className)}>
      {/* Head row: avatar beside name and actions; the bio gets the full width below. */}
      <div className="flex items-start gap-3 sm:gap-4">
        <Avatar className="h-20 w-20 shrink-0 rounded-full ring-2 ring-background sm:h-24 sm:w-24">
          <AvatarImage
            src={profilePicture.src ?? undefined}
            alt={displayName}
            referrerPolicy="no-referrer"
            onError={profilePicture.onError}
            onLoad={profilePicture.onLoad}
          />
          <AvatarImage src={avatarFallbackUrl(pubkey)} alt={displayName} />
          <AvatarFallback>{displayName.charAt(0) || pubkey.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 pt-1 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <h1
              className="truncate text-[22px] font-semibold leading-7 text-foreground sm:text-2xl"
              title={displayName}
            >
              {displayName}
            </h1>
            <TrustBadgeDisplay pubkey={pubkey} score={trustScore?.score} />
            {verifiedLabel && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <BadgeCheck
                    className="h-4 w-4 shrink-0 text-primary"
                    role="img"
                    tabIndex={0}
                    aria-label={verifiedLabel}
                  />
                </TooltipTrigger>
                <TooltipContent>{verifiedLabel}</TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 sm:mt-0 sm:shrink-0 sm:pr-4">
            {isOwnProfile && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsEditOpen(true)}
                className={actionClass}
              >
                {t('pages.author.editProfile', 'Edit profile')}
              </Button>
            )}
            {canFollow && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleFollowClick}
                disabled={isFollowLoading}
                className={actionClass}
              >
                {isFollowing ? (
                  <>
                    <Minus className="h-4 w-4 mr-1" />
                    {t('common.following')}
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-1" />
                    {t('common.follow')}
                  </>
                )}
              </Button>
            )}
            {canZap && (
              <ZapButton
                authorPubkey={pubkey}
                className={actionClass}
                layout="inline"
                showZapText={true}
                size="sm"
              />
            )}
            <UserActionsMenu
              pubkey={pubkey}
              className="relative bg-white/10 backdrop-blur-md hover:bg-white/30 after:absolute after:-inset-1.5"
            />
          </div>
        </div>
      </div>
      {metadata?.about && (
        <div className="mt-3">
          <div
            ref={aboutRef}
            className={cn(
              'break-words text-sm leading-6 text-muted-foreground',
              !isAboutExpanded && 'line-clamp-3'
            )}
          >
            <RichTextContent content={metadata.about} authorPubkey={pubkey} />
          </div>
          {(isAboutClamped || isAboutExpanded) && (
            <button
              onClick={() => setIsAboutExpanded(!isAboutExpanded)}
              className="mt-1 min-h-11 text-sm text-primary hover:underline sm:min-h-0"
            >
              {isAboutExpanded ? t('pages.author.showLess') : t('pages.author.showMore')}
            </button>
          )}
        </div>
      )}
      {isOwnProfile && (
        <EditProfileDialog
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          pubkey={pubkey}
          metadata={metadata as EditableProfile | undefined}
        />
      )}
    </div>
  )
}

function EditProfileDialog({
  open,
  onOpenChange,
  pubkey,
  metadata,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pubkey: string
  metadata?: EditableProfile
}) {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const { config } = useAppContext()
  const { publishProfile, isPending } = useProfilePublish()
  const { data: userBlossomServers } = useUserBlossomServers()
  const bannerInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    name: '',
    about: '',
    website: '',
    nip05: '',
    lightning: '',
    picture: '',
    banner: '',
  })
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<'picture' | 'banner' | null>(null)
  const formBanner = useImageCascade({ src: form.banner, variant: 'preview', authorPubkey: pubkey })
  const formPicture = useImageCascade({
    src: form.picture,
    variant: 'avatar',
    authorPubkey: pubkey,
  })

  const setField = (field: keyof typeof form, value: string) => {
    setFieldError(null)
    setForm(current => ({ ...current, [field]: value }))
  }

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
  const fileUpload = useFileUpload({
    initialServers,
    mirrorServers,
    signer,
  })
  const {
    upload,
    progress: fileUploadProgress,
    uploading: isFileUploading,
    reset: resetFileUpload,
  } = fileUpload

  useEffect(() => {
    if (!open) return

    setForm({
      name: metadata?.display_name || metadata?.displayName || metadata?.name || '',
      about: metadata?.about || '',
      website: metadata?.website || '',
      nip05: metadata?.nip05 || '',
      lightning: metadata?.lud16 || metadata?.lud06 || '',
      picture: metadata?.picture || '',
      banner: metadata?.banner || '',
    })
    setFieldError(null)
    setUploading(null)
    resetFileUpload()
  }, [metadata, open, resetFileUpload])

  const handleImageUpload = async (field: 'picture' | 'banner', file?: File) => {
    if (!file || !user) return
    if (!file.type.startsWith('image/')) {
      setFieldError(t('pages.author.imageOnly', 'Please choose an image file.'))
      return
    }
    if (!canUpload) {
      setFieldError(
        t('pages.author.noBlossomServers', 'Add a Blossom upload server before uploading images.')
      )
      return
    }

    setUploading(field)
    try {
      const { uploadedBlobs } = await upload(file)
      const primaryBlob = uploadedBlobs[0]
      if (!primaryBlob?.url) throw new Error('No uploaded image URL returned')

      setField(field, primaryBlob.url)
      toast.success(t('pages.author.imageUploaded', 'Image uploaded'))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setFieldError(message)
      toast.error(t('pages.author.imageUploadFailed', 'Image upload failed'))
    } finally {
      setUploading(null)
    }
  }

  const handleSave = async () => {
    if (!user || user.pubkey !== pubkey) return

    const lightning = form.lightning.trim()
    const nextProfile: EditableProfile = { ...(metadata || {}) }
    const name = form.name.trim()

    nextProfile.name = name
    nextProfile.display_name = name
    nextProfile.displayName = name
    nextProfile.about = form.about.trim()
    nextProfile.website = form.website.trim()
    nextProfile.nip05 = form.nip05.trim()
    nextProfile.picture = form.picture.trim()
    nextProfile.banner = form.banner.trim()

    delete nextProfile.lud06
    delete nextProfile.lud16
    if (lightning) {
      if (lightning.startsWith('lnurl')) {
        nextProfile.lud06 = lightning
      } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lightning)) {
        nextProfile.lud16 = lightning
      } else {
        setFieldError(t('pages.author.invalidLightning', 'Enter a Lightning address or LNURL.'))
        return
      }
    }

    try {
      await publishProfile(nextProfile)
      toast.success(t('pages.author.profileSaved', 'Profile saved'))
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setFieldError(message)
      toast.error(t('pages.author.profileSaveFailed', 'Profile save failed'))
    }
  }

  const fallbackPicture = avatarFallbackUrl(pubkey)
  const isSaving = isPending || !!uploading || isFileUploading

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('pages.author.editProfile', 'Edit profile')}</DialogTitle>
          <DialogDescription>
            {t('pages.author.editProfileDescription', 'Update your public Nostr profile.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="relative">
            <button
              type="button"
              className="group relative h-32 w-full overflow-hidden rounded-lg border bg-muted sm:h-40"
              onClick={() => bannerInputRef.current?.click()}
              disabled={isSaving}
            >
              {formBanner.src ? (
                <img
                  src={formBanner.src}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={formBanner.onError}
                  onLoad={formBanner.onLoad}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  {t('pages.author.addBanner', 'Add banner')}
                </div>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-white opacity-0 transition-opacity group-hover:opacity-100">
                {uploading === 'banner' ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <Upload className="h-6 w-6" />
                )}
              </span>
            </button>
            <button
              type="button"
              className="group absolute -bottom-10 left-4 h-24 w-24 overflow-hidden rounded-full border-4 border-background bg-muted"
              onClick={() => avatarInputRef.current?.click()}
              disabled={isSaving}
            >
              <img
                src={formPicture.src || fallbackPicture}
                alt=""
                className="h-full w-full object-cover"
                onError={formPicture.onError}
                onLoad={formPicture.onLoad}
              />
              {!formPicture.src && !fallbackPicture && (
                <span className="absolute inset-0 flex items-center justify-center text-lg font-medium">
                  {(form.name || pubkey).charAt(0)}
                </span>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-white opacity-0 transition-opacity group-hover:opacity-100">
                {uploading === 'picture' ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Camera className="h-5 w-5" />
                )}
              </span>
            </button>
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={event => handleImageUpload('banner', event.target.files?.[0])}
            />
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={event => handleImageUpload('picture', event.target.files?.[0])}
            />
          </div>

          <div className="grid gap-4 pt-10 sm:grid-cols-2">
            <ProfileField label={t('pages.author.avatarUrl', 'Avatar URL')} htmlFor="avatar-url">
              <Input
                id="avatar-url"
                value={form.picture}
                placeholder="https://..."
                onChange={event => setField('picture', event.target.value)}
              />
            </ProfileField>
            <ProfileField label={t('pages.author.bannerUrl', 'Banner URL')} htmlFor="banner-url">
              <Input
                id="banner-url"
                value={form.banner}
                placeholder="https://..."
                onChange={event => setField('banner', event.target.value)}
              />
            </ProfileField>
            <ProfileField label={t('pages.author.displayName', 'Display name')} htmlFor="name">
              <Input
                id="name"
                value={form.name}
                onChange={event => setField('name', event.target.value)}
              />
            </ProfileField>
            <ProfileField label={t('pages.author.website', 'Website')} htmlFor="website">
              <Input
                id="website"
                value={form.website}
                placeholder="https://..."
                onChange={event => setField('website', event.target.value)}
              />
            </ProfileField>
            <ProfileField label={t('pages.author.nip05', 'Nostr address')} htmlFor="nip05">
              <Input
                id="nip05"
                value={form.nip05}
                placeholder="name@example.com"
                onChange={event => setField('nip05', event.target.value)}
              />
            </ProfileField>
            <ProfileField label={t('pages.author.lightning', 'Lightning')} htmlFor="lightning">
              <Input
                id="lightning"
                value={form.lightning}
                placeholder="name@example.com"
                onChange={event => setField('lightning', event.target.value)}
              />
            </ProfileField>
            <div className="sm:col-span-2">
              <ProfileField label={t('pages.author.bio', 'Bio')} htmlFor="bio">
                <Textarea
                  id="bio"
                  value={form.about}
                  className="min-h-28"
                  onChange={event => setField('about', event.target.value)}
                />
              </ProfileField>
            </div>
          </div>

          {uploading && fileUploadProgress && (
            <div className="text-sm text-muted-foreground">
              {t('pages.author.uploadingImage', 'Uploading image')}{' '}
              {Math.round(fileUploadProgress.percentage)}%
            </div>
          )}
          {fieldError && <div className="text-sm text-destructive">{fieldError}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProfileField({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}
