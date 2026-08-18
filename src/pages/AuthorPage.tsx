import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { decodeProfilePointer } from '@/lib/nip19'
import { nip19 } from 'nostr-tools'
import { cn, combineRelays } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { VideoGrid } from '@/components/VideoGrid'
import { VideoCard } from '@/components/VideoCard'
import { PlaylistThumbnailCollage } from '@/components/playlists/PlaylistThumbnailCollage'
import { CreatePlaylistDialog } from '@/components/playlists'
import { InfiniteScrollTrigger } from '@/components/InfiniteScrollTrigger'
import { RichTextContent } from '@/components/RichTextContent'
import { ZapButton } from '@/components/ZapButton'
import { FollowingList } from '@/components/FollowingList'
import { Camera, Plus, Minus, Loader2, Upload } from 'lucide-react'
import {
  useProfile,
  useUserPlaylists,
  usePlaylists,
  type Playlist,
  useAppContext,
  useInfiniteScroll,
  useAuthorPageRelays,
  useCurrentUser,
  useFollowSet,
  useUserRelays,
  useAuthorLikedVideos,
  useReportedPubkeys,
  useAuthorFollowing,
  useProfilePublish,
  useUserBlossomServers,
} from '@/hooks'
import { hasLightningAddress } from '@/lib/zap-utils'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline'
import { authorVideoLoader } from '@/nostr/loaders'
import type { VideoEvent } from '@/utils/video-event'
import type { NostrEvent } from 'nostr-tools'
import { getKindsForType } from '@/lib/video-types'
import { useEventStore } from 'applesauce-react/hooks'
import { use$ } from 'applesauce-react/hooks'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { useShortsFeedStore } from '@/stores/shortsFeedStore'
import { useTranslation } from 'react-i18next'
import { TrustBadge } from '@/components/TrustBadge'
import { useFileUpload } from '@/hooks/useFileUpload'
import { DEFAULT_MIRROR_SERVERS, DEFAULT_UPLOAD_SERVERS } from '@/lib/blossom-servers'
import { toast } from 'sonner'
import type { Signer } from '@/lib/blossom-auth'
import type { ReactNode } from 'react'
import { ContentSafetyRoute } from '@/components/ContentSafetyGate'
import { getContentSafetyGate } from '@/lib/content-safety'
import { useImageCascade } from '@/hooks/useImageCascade'

type Tabs = 'overview' | 'videos' | 'shorts' | 'playlists' | 'liked' | 'following'
const AUTHOR_TABS: Tabs[] = ['overview', 'videos', 'shorts', 'playlists', 'liked', 'following']

function isAuthorTab(tab: string | undefined): tab is Tabs {
  return !!tab && AUTHOR_TABS.includes(tab as Tabs)
}
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

interface PinRef {
  id?: string
  address?: string
}

function AuthorBanner({
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

function AuthorBannerDisplay({ banner, pubkey }: { banner: string; pubkey: string }) {
  const cascade = useImageCascade({ src: banner, variant: 'preview', authorPubkey: pubkey })
  if (!cascade.src) return null

  return (
    <div className="relative w-full h-32 sm:h-48 md:h-56 overflow-hidden rounded-lg">
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

function AuthorProfile({
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

  return (
    <div
      className={cn(
        'flex items-start space-x-4 relative',
        hasBanner && 'ml-6 -mt-16 sm:-mt-20',
        className
      )}
    >
      <div className="shrink-0">
        <img
          src={profilePicture.src || `https://api.dicebear.com/7.x/avataaars/svg?seed=${pubkey}`}
          alt={displayName}
          className="w-24 h-24 rounded-full ring-2 ring-background object-cover"
          onError={profilePicture.onError}
          onLoad={profilePicture.onLoad}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">{displayName}</h1>
            <TrustBadge pubkey={pubkey} />
          </div>
          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4 pr-4">
            {isOwnProfile && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsEditOpen(true)}
                className="bg-white/10 backdrop-blur-md hover:bg-white/30"
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
                className=" bg-white/10 backdrop-blur-md hover:bg-white/30"
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
                className="bg-white/10 backdrop-blur-md hover:bg-white/30"
                layout="inline"
                showZapText={true}
                size="sm"
              />
            )}
          </div>
        </div>
        {metadata?.about && (
          <div className="mt-1">
            <div
              ref={aboutRef}
              className={cn('text-sm text-muted-foreground', !isAboutExpanded && 'line-clamp-3')}
            >
              <RichTextContent content={metadata.about} authorPubkey={pubkey} />
            </div>
            {(isAboutClamped || isAboutExpanded) && (
              <button
                onClick={() => setIsAboutExpanded(!isAboutExpanded)}
                className="text-sm text-primary hover:underline mt-1"
              >
                {isAboutExpanded ? t('pages.author.showLess') : t('pages.author.showMore')}
              </button>
            )}
          </div>
        )}
      </div>
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

  const fallbackPicture = `https://api.dicebear.com/7.x/avataaars/svg?seed=${pubkey}`
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

function AuthorPageContent() {
  const { t } = useTranslation()
  const { nprofile, tab } = useParams<{ nprofile: string; tab?: string }>()
  const location = useLocation()
  const activeTab: Tabs = isAuthorTab(tab) ? tab : 'overview'
  const setShortsFeedVideos = useShortsFeedStore(state => state.setVideos)

  // Decode nprofile to get pubkey and relays
  const profileData = useMemo(() => {
    if (!nprofile) return null
    return decodeProfilePointer(nprofile)
  }, [nprofile])

  const pubkey = profileData?.pubkey || ''
  const nprofileRelays = profileData?.relays || []
  const profileBasePath = `${location.pathname.startsWith('/author/') ? '/author' : '/p'}/${nprofile}`
  const getTabPath = (nextTab: Tabs) =>
    nextTab === 'overview' ? profileBasePath : `${profileBasePath}/${nextTab}`

  // State for selected playlist videos
  const [playlistVideos, setPlaylistVideos] = useState<Record<string, VideoEvent[]>>({})
  const [loadingPlaylist, setLoadingPlaylist] = useState<string | null>(null)
  const loadedPlaylistsRef = useRef<Set<string>>(new Set())

  const { user } = useCurrentUser()
  const isOwnProfile = user?.pubkey === pubkey
  const { createPlaylist } = usePlaylists()
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false)

  const { config, pool } = useAppContext()
  const eventStoreInstance = useEventStore()
  const { presetContent } = useSelectedPreset()

  // Get relays for this author page
  // Initially: nprofile relays, user config, presets, purplepag.es
  // After NIP-65 loads: also includes author's outbox relays (reactive update)
  const relaysFromHook = useAuthorPageRelays({
    nprofileRelays,
    authorPubkey: pubkey,
  })

  // Stabilize relays array to prevent unnecessary loader recreations
  // Only update if the relay URLs actually changed (deep comparison)
  // Note: NIP-65 relay discovery is handled by useUserRelays inside useAuthorPageRelays
  // with indexer relays included for better discovery in incognito mode
  const relaysKey = relaysFromHook.join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deep-compare relay URLs to prevent unnecessary loader recreations
  const relays = useMemo(() => relaysFromHook, [relaysKey])

  // Fetch playlists and videos for this author using the reactive relay set
  const { data: playlists = [], isLoading: isLoadingPlaylists } = useUserPlaylists(pubkey, relays)

  // Fetch liked/zapped video IDs for this author
  const {
    eventIds: likedEventIds,
    isLoading: isLoadingLiked,
    count: likedCount,
  } = useAuthorLikedVideos(pubkey)
  const [likedVideos, setLikedVideos] = useState<VideoEvent[]>([])
  const [loadingLikedVideos, setLoadingLikedVideos] = useState(false)
  const likedVideosLoadedRef = useRef(false)
  const blockedPubkeys = useReportedPubkeys()

  // Fetch author's media follows list (kind 10020, NIP-51)
  const { followedPubkeys: authorFollowing, isLoading: isLoadingFollowing } = useAuthorFollowing(
    pubkey,
    relays
  )
  const pinFilter = useMemo(() => [{ kinds: [10001], authors: pubkey ? [pubkey] : [] }], [pubkey])
  const rawPinEvents = use$(
    () => eventStoreInstance.timeline(pinFilter),
    [eventStoreInstance, pinFilter]
  )
  const pinEvents = useMemo(() => rawPinEvents ?? [], [rawPinEvents])
  const [pinnedVideos, setPinnedVideos] = useState<VideoEvent[]>([])
  const loadedPinsKeyRef = useRef<string | null>(null)

  // Helper to fetch full video events for a playlist
  const fetchPlaylistVideos = useCallback(
    async (playlist: Playlist) => {
      if (!playlist || !playlist.videos?.length) return []
      setLoadingPlaylist(playlist.identifier)

      try {
        const refs = playlist.videos.map(v => ({ id: v.id, address: v.address }))
        // Check which events are missing from store
        const missingRefs = refs.filter(ref => {
          if (ref.address) {
            const parts = ref.address.split(':')
            if (parts.length < 3) return false
            const kind = parseInt(parts[0], 10)
            const author = parts[1]
            const identifier = parts.slice(2).join(':')
            return !eventStoreInstance.getReplaceable(kind, author, identifier)
          }
          return !eventStoreInstance.getEvent(ref.id)
        })

        if (missingRefs.length > 0) {
          // Create a loader to fetch the missing events with proper relays
          const { createEventLoader, createAddressLoader } =
            await import('applesauce-loaders/loaders')

          // Get relay hints from where the playlist itself was seen
          const playlistEvent = playlist.eventId
            ? eventStoreInstance.getEvent(playlist.eventId)
            : undefined
          const playlistSeenRelaysSet = playlistEvent ? getSeenRelays(playlistEvent) : undefined
          const playlistSeenRelays = playlistSeenRelaysSet ? Array.from(playlistSeenRelaysSet) : []

          // Fetch missing events with relay hints
          const fetchPromises = missingRefs.map(ref => {
            // Get relay hints from where this event has been seen before
            const referencedEvent = ref.id ? eventStoreInstance.getEvent(ref.id) : undefined
            const seenRelaysSet = referencedEvent ? getSeenRelays(referencedEvent) : undefined
            const seenRelays = seenRelaysSet ? Array.from(seenRelaysSet) : []

            // Combine seen relays with playlist relays and general relays (prioritize seen relays)
            const videoRelays = combineRelays([seenRelays, playlistSeenRelays, relays])

            // Create loader with specific relay hints for this video
            if (ref.address) {
              const parts = ref.address.split(':')
              if (parts.length >= 3) {
                const loader = createAddressLoader(pool, {
                  eventStore: eventStoreInstance,
                  extraRelays: videoRelays,
                })
                return loader({
                  kind: parseInt(parts[0], 10),
                  pubkey: parts[1],
                  identifier: parts.slice(2).join(':'),
                })
                  .toPromise()
                  .catch(err => {
                    console.warn(`Failed to fetch address ${ref.address}:`, err)
                    return null
                  })
              }
            }

            const loader = createEventLoader(pool, {
              eventStore: eventStoreInstance,
              extraRelays: videoRelays,
            })
            return loader({ id: ref.id })
              .toPromise()
              .catch(err => {
                console.warn(`Failed to fetch event ${ref.id}:`, err)
                return null
              })
          })

          const fetchedEvents = (await Promise.all(fetchPromises)).filter(Boolean)

          // Add fetched events to the store
          fetchedEvents.forEach(event => {
            if (event) eventStoreInstance.add(event)
          })
        }

        // Get all events from store (both existing and newly fetched)
        const events = refs
          .map(ref => {
            if (ref.address) {
              const parts = ref.address.split(':')
              if (parts.length >= 3) {
                const kind = parseInt(parts[0], 10)
                const author = parts[1]
                const identifier = parts.slice(2).join(':')
                return eventStoreInstance.getReplaceable(kind, author, identifier)
              }
            }
            return eventStoreInstance.getEvent(ref.id)
          })
          .filter((e): e is NostrEvent => !!e)

        // Process events to VideoEvent format
        const { processEvents } = await import('@/utils/video-event')
        const processedVideos = processEvents(events, relays, {
          blossomServers: config.blossomServers,
          nsfwPubkeys: presetContent.nsfwPubkeys,
          reportedEventIds: config.reportedEventIds,
          includeYouTube: config.showYouTubeContent ?? true,
          includeAudio: true,
        })

        setPlaylistVideos(prev => ({ ...prev, [playlist.identifier]: processedVideos }))
        loadedPlaylistsRef.current.add(playlist.identifier)
        return processedVideos
      } catch (error) {
        console.error('Failed to fetch playlist videos:', error)
        setPlaylistVideos(prev => ({ ...prev, [playlist.identifier]: [] }))
        loadedPlaylistsRef.current.add(playlist.identifier) // Mark as attempted even if failed
        return []
      } finally {
        setLoadingPlaylist(null)
      }
    },
    [config, pool, eventStoreInstance, relays, presetContent.nsfwPubkeys]
  )

  // Helper to fetch liked/zapped video events
  const fetchLikedVideos = useCallback(async () => {
    if (likedEventIds.length === 0 || likedVideosLoadedRef.current) return
    setLoadingLikedVideos(true)

    try {
      const { createEventLoader } = await import('applesauce-loaders/loaders')
      const { processEvents } = await import('@/utils/video-event')

      // Check which events are missing from store
      const missingIds = likedEventIds.filter(id => !eventStoreInstance.getEvent(id))

      if (missingIds.length > 0) {
        const loader = createEventLoader(pool, {
          eventStore: eventStoreInstance,
          extraRelays: relays,
        })

        // Load in chunks
        const CHUNK_SIZE = 50
        for (let i = 0; i < missingIds.length; i += CHUNK_SIZE) {
          const chunk = missingIds.slice(i, i + CHUNK_SIZE)
          await Promise.all(
            chunk.map(id =>
              loader({ id })
                .toPromise()
                .then(e => e && eventStoreInstance.add(e))
                .catch(() => {})
            )
          )
        }
      }

      // Get all events from store
      const events = likedEventIds
        .map(id => eventStoreInstance.getEvent(id))
        .filter((e): e is NostrEvent => !!e)

      const processedVideos = processEvents(events, relays, {
        blockPubkeys: blockedPubkeys,
        blossomServers: config.blossomServers,
        nsfwPubkeys: presetContent.nsfwPubkeys,
        reportedEventIds: config.reportedEventIds,
        includeYouTube: config.showYouTubeContent ?? true,
        includeAudio: true,
      })

      setLikedVideos(processedVideos)
      likedVideosLoadedRef.current = true
    } catch (error) {
      console.error('Failed to fetch liked videos:', error)
    } finally {
      setLoadingLikedVideos(false)
    }
  }, [
    likedEventIds,
    eventStoreInstance,
    pool,
    relays,
    blockedPubkeys,
    config.blossomServers,
    presetContent.nsfwPubkeys,
    config.reportedEventIds,
    config.showYouTubeContent,
  ])

  useEffect(() => {
    if (activeTab === 'liked' && !likedVideosLoadedRef.current) {
      void fetchLikedVideos()
    }
  }, [activeTab, fetchLikedVideos])

  useEffect(() => {
    const pinsKey = `${pubkey}:${relays.join(',')}`
    if (!pubkey || loadedPinsKeyRef.current === pinsKey) return
    loadedPinsKeyRef.current = pinsKey
    let unsubscribe: (() => void) | undefined

    const loadPinList = async () => {
      try {
        const { createTimelineLoader } = await import('applesauce-loaders/loaders')
        const pinLoader = createTimelineLoader(pool, relays, pinFilter, {
          eventStore: eventStoreInstance,
        })
        const sub = pinLoader().subscribe({
          next: event => eventStoreInstance.add(event),
          error: () => {},
        })
        unsubscribe = () => sub.unsubscribe()
      } catch (error) {
        console.error('Failed to load pin list:', error)
      }
    }

    void loadPinList()
    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [pubkey, pool, relays, pinFilter, eventStoreInstance])

  useEffect(() => {
    if (!pubkey) return
    let cancelled = false

    const loadPinnedVideos = async () => {
      try {
        const { createEventLoader, createAddressLoader } =
          await import('applesauce-loaders/loaders')
        const { processEvents } = await import('@/utils/video-event')

        const latestPinEvent = [...pinEvents].sort((a, b) => b.created_at - a.created_at)[0]
        if (!latestPinEvent) {
          if (!cancelled) setPinnedVideos([])
          return
        }

        const refs: PinRef[] = latestPinEvent.tags.flatMap((tag): PinRef[] => {
          if (tag[0] === 'e' && tag[1]) return [{ id: tag[1] }]
          if (tag[0] === 'a' && tag[1]) {
            const parts = tag[1].split(':')
            const kind = parseInt(parts[0] || '0', 10)
            if (kind === 34235 || kind === 34236) return [{ address: tag[1] }]
          }
          return []
        })

        if (refs.length === 0) {
          if (!cancelled) setPinnedVideos([])
          return
        }

        const fetches = refs.map(async ref => {
          if (ref.address) {
            const parts = ref.address.split(':')
            if (parts.length < 3) return null
            const kind = parseInt(parts[0], 10)
            const author = parts[1]
            const identifier = parts.slice(2).join(':')
            const existing = eventStoreInstance.getReplaceable(kind, author, identifier)
            if (existing) return existing
            const loader = createAddressLoader(pool, {
              eventStore: eventStoreInstance,
              extraRelays: relays,
            })
            return loader({ kind, pubkey: author, identifier })
              .toPromise()
              .catch(() => null)
          }

          if (!ref.id) return null
          const existing = eventStoreInstance.getEvent(ref.id)
          if (existing) return existing
          const loader = createEventLoader(pool, {
            eventStore: eventStoreInstance,
            extraRelays: relays,
          })
          return loader({ id: ref.id })
            .toPromise()
            .catch(() => null)
        })

        const loadedEvents = (await Promise.all(fetches)).filter((e): e is NostrEvent => Boolean(e))
        const processed = processEvents(loadedEvents, relays, {
          blossomServers: config.blossomServers,
          nsfwPubkeys: presetContent.nsfwPubkeys,
          reportedEventIds: config.reportedEventIds,
          includeYouTube: config.showYouTubeContent ?? true,
          includeAudio: true,
        })
        const deduped = Array.from(new Map(processed.map(video => [video.id, video])).values())
        if (!cancelled) setPinnedVideos(deduped)
      } catch (error) {
        console.error('Failed to load pinned videos:', error)
      }
    }

    loadPinnedVideos()
    return () => {
      cancelled = true
    }
  }, [
    pubkey,
    pinEvents,
    pool,
    relays,
    eventStoreInstance,
    config.blossomServers,
    presetContent.nsfwPubkeys,
    config.reportedEventIds,
    config.showYouTubeContent,
  ])

  // Auto-fetch video events for all playlists when playlists are loaded
  useEffect(() => {
    // Only start fetching videos after playlists have finished loading
    if (!isLoadingPlaylists && playlists.length > 0) {
      playlists.forEach(playlist => {
        // Only fetch if we haven't already loaded this playlist's videos
        if (!loadedPlaylistsRef.current.has(playlist.identifier) && playlist.videos.length > 0) {
          // Fire off fetch without awaiting (parallel loading)
          fetchPlaylistVideos(playlist).catch(err =>
            console.error('Failed to fetch playlist videos:', err)
          )
        }
      })
    }
  }, [playlists, isLoadingPlaylists, fetchPlaylistVideos]) // Include fetchPlaylistVideos dependency

  // Memoize the loader to prevent recreation on every render
  const loader = useMemo(() => {
    if (import.meta.env.DEV) {
      console.log('[AuthorPage] creating loader for', pubkey.slice(0, 8), 'with relays:', relays)
    }
    return authorVideoLoader(pubkey, relays)
  }, [pubkey, relays])

  const timelineFilter = useMemo(
    () => ({ kinds: getKindsForType('all'), authors: [pubkey] }),
    [pubkey]
  )

  const {
    videos: allVideos,
    loading,
    exhausted,
    loadMore,
  } = useInfiniteTimeline(loader, relays, { filters: timelineFilter, includeAudio: true })

  const { loadMoreRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    loading,
    exhausted,
  })

  const shorts = useMemo(() => allVideos.filter(v => v.type == 'shorts'), [allVideos])

  useEffect(() => {
    if (shorts.length > 0) {
      setShortsFeedVideos(shorts)
    }
  }, [shorts, setShortsFeedVideos])

  const videos = useMemo(() => allVideos.filter(v => v.type == 'videos'), [allVideos])

  const authorMeta = useProfile({ pubkey })
  const authorName = authorMeta?.display_name || authorMeta?.name || pubkey?.slice(0, 8) || pubkey

  useEffect(() => {
    if (authorName) {
      document.title = `${authorName} - nostube`
    } else {
      document.title = 'nostube'
    }
    return () => {
      document.title = 'nostube'
    }
  }, [authorName])

  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const handleBannerLoad = useCallback(() => {
    if (authorMeta?.banner) setBannerUrl(authorMeta.banner)
  }, [authorMeta?.banner])
  const handleBannerError = useCallback(() => setBannerUrl(null), [])

  if (!pubkey) return null

  const overviewPlaylists = playlists
    .filter(playlist => playlist.videos && playlist.videos.length > 0)
    .sort((a, b) => b.videos.length - a.videos.length)
    .slice(0, 8)

  return (
    <div className="max-w-560 mx-auto sm:p-4">
      <AuthorBanner pubkey={pubkey} onLoad={handleBannerLoad} onError={handleBannerError} />
      {bannerUrl && <AuthorBannerDisplay banner={bannerUrl} pubkey={pubkey} />}
      <AuthorProfile className="p-2" pubkey={pubkey} hasBanner={!!bannerUrl} />

      <div className="p-2">
        {/* Scrollable tab bar */}
        <div className="w-full overflow-x-auto scroll-smooth scrollbar-hide -mx-2 px-2 py-2">
          <div className="flex gap-2 min-w-max">
            <Button
              variant={activeTab === 'overview' ? 'default' : 'outline'}
              size="sm"
              className="shrink-0 rounded-full px-4"
              asChild
            >
              <Link to={getTabPath('overview')}>{t('pages.author.overview', 'Overview')}</Link>
            </Button>
            {videos.length > 0 && (
              <Button
                variant={activeTab === 'videos' ? 'default' : 'outline'}
                size="sm"
                className="shrink-0 rounded-full px-4"
                asChild
              >
                <Link to={getTabPath('videos')}>
                  {t('pages.author.allVideos', { count: videos.length })}
                </Link>
              </Button>
            )}
            {shorts.length > 0 && (
              <Button
                variant={activeTab === 'shorts' ? 'default' : 'outline'}
                size="sm"
                className="shrink-0 rounded-full px-4"
                asChild
              >
                <Link to={getTabPath('shorts')}>
                  {t('pages.author.allShorts', { count: shorts.length })}
                </Link>
              </Button>
            )}

            {(isLoadingPlaylists || playlists.length > 0 || isOwnProfile) && (
              <Button
                variant={activeTab === 'playlists' ? 'default' : 'outline'}
                size="sm"
                className="shrink-0 rounded-full px-4"
                asChild
              >
                <Link to={getTabPath('playlists')}>
                  {t('pages.author.playlists', 'Playlists ({{count}})', {
                    count: playlists.length,
                  })}
                </Link>
              </Button>
            )}
            {likedCount > 0 && (
              <Button
                variant={activeTab === 'liked' ? 'default' : 'outline'}
                size="sm"
                className="shrink-0 rounded-full px-4"
                asChild
              >
                <Link to={getTabPath('liked')}>
                  {t('pages.author.liked', { count: likedCount })}
                </Link>
              </Button>
            )}
            {authorFollowing.length > 0 && (
              <Button
                variant={activeTab === 'following' ? 'default' : 'outline'}
                size="sm"
                className="shrink-0 rounded-full px-4"
                asChild
              >
                <Link to={getTabPath('following')}>
                  {t('pages.author.following', { count: authorFollowing.length })}
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && (
          <div className="mt-6 space-y-8">
            {pinnedVideos.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-semibold">{t('pages.author.pinned', 'Pinned')}</h2>
                </div>
                <div className="w-full overflow-x-auto scrollbar-hide">
                  <div className="flex gap-2 min-w-max">
                    {pinnedVideos.map(video => (
                      <div key={`pinned-${video.id}`} className="w-72 shrink-0">
                        <VideoCard
                          video={video}
                          format={video.type === 'shorts' ? 'vertical' : 'horizontal'}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
            {videos.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-semibold">
                    {t('pages.author.latestVideos', 'Latest videos')}
                  </h2>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={getTabPath('videos')}>{t('common.viewAll', 'View all')}</Link>
                  </Button>
                </div>
                <div className="w-full overflow-x-auto scrollbar-hide">
                  <div className="flex gap-2 min-w-max">
                    {videos.slice(0, 10).map(video => (
                      <div key={`latest-video-${video.id}`} className="w-80 shrink-0">
                        <VideoCard video={video} format="horizontal" />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
            {shorts.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-semibold">
                    {t('pages.author.latestShorts', 'Latest shorts')}
                  </h2>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={getTabPath('shorts')}>{t('common.viewAll', 'View all')}</Link>
                  </Button>
                </div>
                <div className="w-full overflow-x-auto scrollbar-hide">
                  <div className="flex gap-0 sm:gap-2 min-w-max">
                    {shorts.slice(0, 10).map((video, index) => (
                      <div key={`latest-short-${video.id}`} className="w-44 shrink-0">
                        <VideoCard
                          video={video}
                          format="vertical"
                          allVideos={shorts}
                          videoIndex={index}
                          tightGridGap
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
            {overviewPlaylists.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-semibold">
                    {t('pages.author.playlistsTitle', 'Playlists')}
                  </h2>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={getTabPath('playlists')}>{t('common.viewAll', 'View all')}</Link>
                  </Button>
                </div>
                <div className="w-full overflow-x-auto scrollbar-hide">
                  <div className="flex gap-3 min-w-max">
                    {overviewPlaylists.map(playlist => {
                      const playlistNaddr = nip19.naddrEncode({
                        kind: 30005,
                        pubkey,
                        identifier: playlist.identifier,
                        relays: relays.slice(0, 3),
                      })
                      const videoIds = playlist.videos.map(video => video.id)
                      return (
                        <Link
                          key={`playlist-overview-${playlist.identifier}`}
                          to={`/playlist/${playlistNaddr}`}
                          className="group w-72 shrink-0 rounded-lg p-2 transition-colors hover:bg-accent"
                        >
                          <PlaylistThumbnailCollage
                            videoIds={videoIds}
                            safetyState={playlist.safetyState}
                            contentWarning={playlist.contentWarning}
                            className="rounded-lg transition-transform duration-200 group-hover:scale-[1.02]"
                          />
                          <div className="pt-3">
                            <div className="font-medium line-clamp-1">{playlist.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {playlist.videos.length} videos
                            </div>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {activeTab === 'videos' && (
          <div className="mt-6">
            <VideoGrid videos={videos} isLoading={loading} showSkeletons={true} layoutMode="auto" />
            <InfiniteScrollTrigger
              triggerRef={loadMoreRef}
              loading={loading && videos.length > 0}
              exhausted={exhausted}
              itemCount={videos.length}
              emptyMessage={t('pages.author.noVideos')}
              loadingMessage={t('pages.author.loadingMore')}
              exhaustedMessage={t('pages.author.noMore')}
            />
          </div>
        )}

        {activeTab === 'shorts' && (
          <div className="mt-6">
            <VideoGrid
              videos={shorts}
              isLoading={loading}
              showSkeletons={true}
              layoutMode="vertical"
            />
            <InfiniteScrollTrigger
              triggerRef={loadMoreRef}
              loading={loading && shorts.length > 0}
              exhausted={exhausted}
              itemCount={shorts.length}
              emptyMessage={t('pages.author.noShorts')}
              loadingMessage={t('pages.author.loadingMoreShorts')}
              exhaustedMessage={t('pages.author.noMoreShorts')}
            />
          </div>
        )}

        {activeTab === 'liked' && (
          <div className="mt-6">
            <VideoGrid
              videos={likedVideos}
              isLoading={loadingLikedVideos || isLoadingLiked}
              showSkeletons={true}
              layoutMode="auto"
            />
            {likedVideos.length === 0 && !loadingLikedVideos && !isLoadingLiked && (
              <div className="text-center py-12 text-muted-foreground">
                {t('pages.author.noLikedVideos')}
              </div>
            )}
          </div>
        )}

        {activeTab === 'playlists' && (
          <div className="mt-6 space-y-6">
            {isOwnProfile && (
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setCreatePlaylistOpen(true)}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  {t('playlists.create.newPlaylist')}
                </Button>
                <CreatePlaylistDialog
                  open={createPlaylistOpen}
                  onOpenChange={setCreatePlaylistOpen}
                  onCreatePlaylist={createPlaylist}
                />
              </div>
            )}
            {isLoadingPlaylists && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('pages.author.loadingPlaylists')}
              </div>
            )}
            {playlists.length === 0 && !isLoadingPlaylists && (
              <div className="text-center py-12 text-muted-foreground">
                {t('pages.author.noPlaylists', 'No playlists yet.')}
              </div>
            )}
            {playlists.map(playlist => {
              const playlistNaddr = nip19.naddrEncode({
                kind: 30005,
                pubkey,
                identifier: playlist.identifier,
                relays: relays.slice(0, 3),
              })
              const isLoading = loadingPlaylist === playlist.identifier
              const previewVideos = (playlistVideos[playlist.identifier] || []).slice(0, 10)
              return (
                <section key={`playlist-tab-${playlist.identifier}`} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold truncate">
                        <Link to={`/playlist/${playlistNaddr}`} className="hover:underline">
                          {playlist.name}
                        </Link>
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {playlist.videos.length} videos
                      </p>
                    </div>
                    <Link to={`/playlist/${playlistNaddr}`}>
                      <Button variant="outline" size="sm">
                        {t('pages.author.openPlaylist', 'Open playlist')}
                      </Button>
                    </Link>
                  </div>
                  {isLoading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t('pages.author.loadingPreview', 'Loading preview...')}
                    </div>
                  )}
                  <div className="w-full overflow-x-auto scrollbar-hide">
                    <div className="flex gap-2 min-w-max">
                      {previewVideos.length === 0 && !isLoading && (
                        <div className="text-xs text-muted-foreground">
                          {t('pages.author.noPlaylistVideos', 'No videos in this playlist.')}
                        </div>
                      )}
                      {previewVideos.map(video => (
                        <div
                          key={`playlist-tab-video-${playlist.identifier}-${video.id}`}
                          className="w-72 shrink-0"
                        >
                          <VideoCard
                            video={video}
                            format={video.type === 'shorts' ? 'vertical' : 'horizontal'}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )
            })}
          </div>
        )}

        {activeTab === 'following' && (
          <div className="mt-6">
            <FollowingList
              pubkeys={authorFollowing}
              relays={relays}
              isLoading={isLoadingFollowing}
            />
            {authorFollowing.length === 0 && !isLoadingFollowing && (
              <div className="text-center py-12 text-muted-foreground">
                {t('pages.author.noFollowing')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function AuthorPage() {
  const { nprofile } = useParams<{ nprofile: string }>()
  const navigate = useNavigate()
  const { config } = useAppContext()
  const { presetContent } = useSelectedPreset()
  const blockedPubkeys = useReportedPubkeys()
  const pubkey = useMemo(() => decodeProfilePointer(nprofile ?? '')?.pubkey, [nprofile])
  const safetyGate = getContentSafetyGate(pubkey, config.nsfwFilter, {
    nsfwPubkeys: presetContent.nsfwPubkeys,
    blockedPubkeys,
  })

  return (
    <ContentSafetyRoute safetyGate={safetyGate} onGoHome={() => navigate('/', { replace: true })}>
      <AuthorPageContent />
    </ContentSafetyRoute>
  )
}
