import type { LucideIcon } from 'lucide-react'
import { Cog, Compass, FileText, Home, Library, Play, Users } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCurrentUser, useFollowSet } from '@/hooks'
import { isBetaUser } from '@/lib/beta-users'

export type NavigationSection = 'navigation' | 'library' | 'configuration'

export interface NavigationMenuItem {
  id: string
  label: string
  icon: LucideIcon
  href: string
  section: NavigationSection
  noFill?: boolean
}

export interface NavigationMenu {
  navigationItems: NavigationMenuItem[]
  libraryItems: NavigationMenuItem[]
  configurationItems: NavigationMenuItem[]
  compactItems: NavigationMenuItem[]
  mobilePrimaryItems: NavigationMenuItem[]
  mobileMoreItems: NavigationMenuItem[]
}

export function useNavigationMenu(): NavigationMenu {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const { followedPubkeys } = useFollowSet()
  const hasFollows = !!user && followedPubkeys.length > 0

  return useMemo(() => {
    const navigationItems = hasFollows
      ? [
          {
            id: 'subscriptions',
            label: t('navigation.subscriptions'),
            icon: Users,
            href: '/',
            section: 'navigation' as const,
          },
          {
            id: 'shorts',
            label: t('navigation.shorts'),
            icon: Play,
            href: '/shorts',
            section: 'navigation' as const,
          },
          {
            id: 'explore',
            label: t('navigation.explore'),
            icon: Compass,
            href: '/explore',
            section: 'navigation' as const,
            noFill: true,
          },
        ]
      : [
          {
            id: 'home',
            label: t('navigation.home'),
            icon: Home,
            href: '/',
            section: 'navigation' as const,
          },
          {
            id: 'shorts',
            label: t('navigation.shorts'),
            icon: Play,
            href: '/shorts',
            section: 'navigation' as const,
          },
        ]

    const libraryItems = user
      ? [
          {
            id: 'library',
            label: t('navigation.library'),
            icon: Library,
            href: '/library',
            section: 'library' as const,
          },
          ...(isBetaUser(user.pubkey)
            ? [
                {
                  id: 'video-notes',
                  label: t('navigation.videoNotes'),
                  icon: FileText,
                  href: '/video-notes',
                  section: 'library' as const,
                },
              ]
            : []),
        ]
      : []

    const configurationItems = [
      {
        id: 'settings',
        label: t('navigation.settings'),
        icon: Cog,
        href: '/settings',
        section: 'configuration' as const,
      },
    ]
    const compactItems = [...navigationItems, ...libraryItems, ...configurationItems]
    const mobilePrimaryItems = [
      ...navigationItems,
      ...(user ? libraryItems.filter(item => item.id === 'library') : []),
    ]
    const mobileMoreItems = compactItems.filter(
      item => !mobilePrimaryItems.some(primaryItem => primaryItem.id === item.id)
    )

    return {
      navigationItems,
      libraryItems,
      configurationItems,
      compactItems,
      mobilePrimaryItems,
      mobileMoreItems,
    }
  }, [hasFollows, t, user])
}
