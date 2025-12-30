import React, { useState, useCallback } from 'react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { imageProxy } from '@/lib/utils'
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
  /** Thumbnail resize server URL for proxying images */
  thumbResizeServerUrl?: string
}

/**
 * Generates a dicebear avatar URL based on pubkey
 */
function getDicebearUrl(seed: string): string {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`
}

/**
 * UserAvatar component that displays a user's profile picture with
 * automatic fallback to a generated dicebear avatar.
 *
 * Fallback order:
 * 1. User's profile picture (proxied if thumbResizeServerUrl provided)
 * 2. Dicebear avatar generated from pubkey (if picture fails or not provided)
 * 3. First character of name (if dicebear also fails)
 */
export const UserAvatar = React.memo(function UserAvatar({
  picture,
  pubkey,
  name,
  className,
  thumbResizeServerUrl,
}: UserAvatarProps) {
  const [imageError, setImageError] = useState(false)

  const handleImageError = useCallback(() => {
    setImageError(true)
  }, [])

  // Determine the avatar source
  const fallbackSeed = pubkey || name || 'default'
  const dicebearUrl = getDicebearUrl(fallbackSeed)

  // Use picture if available and not errored, otherwise use dicebear
  const avatarSrc = picture && !imageError ? imageProxy(picture, thumbResizeServerUrl) : dicebearUrl

  // Character fallback (last resort if dicebear also fails)
  const fallbackChar = name?.charAt(0) || pubkey?.charAt(0) || '?'

  return (
    <Avatar className={cn(className)}>
      <AvatarImage
        src={avatarSrc}
        alt={name || pubkey?.slice(0, 8) || ''}
        onError={handleImageError}
      />
      <AvatarFallback>{fallbackChar}</AvatarFallback>
    </Avatar>
  )
})
