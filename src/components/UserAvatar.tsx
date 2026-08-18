import React from 'react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { useImageCascade } from '@/hooks/useImageCascade'
import { cn } from '@/lib/utils'

interface UserAvatarProps {
  /** User's profile picture URL */
  picture?: string | null
  /** User's pubkey for generating fallback avatar */
  pubkey?: string
  /** User's name for alt text and character fallback */
  name?: string
  /** Additional className for the Avatar wrapper */
  className?: string
}

/**
 * UserAvatar component that displays a user's profile picture with
 * automatic fallback to a generated dicebear avatar.
 *
 * Fallback order:
 * 1. User's profile picture through the image proxy.
 * 2. User's profile picture raw (bypassing the proxy).
 * 3. Dicebear avatar generated from pubkey.
 * 4. First character of name (shadcn AvatarFallback if the dicebear svg also fails).
 */
export const UserAvatar = React.memo(function UserAvatar({
  picture,
  pubkey,
  name,
  className,
}: UserAvatarProps) {
  const cascade = useImageCascade({ src: picture, variant: 'avatar', authorPubkey: pubkey })

  const fallbackSeed = pubkey || name || 'default'
  const dicebearUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${fallbackSeed}`
  const avatarSrc = cascade.src ?? dicebearUrl

  // Character fallback (last resort if dicebear also fails)
  const fallbackChar = name?.charAt(0) || pubkey?.charAt(0) || '?'

  return (
    <Avatar className={cn(className)}>
      <AvatarImage
        src={avatarSrc}
        alt={name || pubkey?.slice(0, 8) || ''}
        referrerPolicy="no-referrer"
        onError={cascade.onError}
        onLoad={cascade.onLoad}
      />
      <AvatarFallback>{fallbackChar}</AvatarFallback>
    </Avatar>
  )
})
