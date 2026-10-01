import type { LucideIcon } from 'lucide-react'
import { Cog, FileText, Home, Library, Play, Users } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCurrentUser } from '@/hooks'
import { isBetaUser } from '@/lib/beta-users'

export type NavigationSection = 'navigation' | 'library' | 'configuration'

export interface NavigationMenuItem {
  id: string
  label: string
  icon: LucideIcon
  href: string
  section: NavigationSection
}

export interface NavigationMenu {
  navigationItems: NavigationMenuItem[]
  libraryItems: NavigationMenuItem[]
  configurationItems: NavigationMenuItem[]
  compactItems: NavigationMenuItem[]
  mobilePrimaryItems: NavigationMenuItem[]
  mobileMoreItems: NavigationMenuItem[]
}

// Primary destinations keep their label/icon/position regardless of follow
// state (issue #88). Subscriptions only shows when signed in: guests have no
// follow list.
export function useNavigationMenu(): NavigationMenu {
  const { t } = useTranslation()
  const { user } = useCurrentUser()

  return useMemo(() => {
    const navigationItems: NavigationMenuItem[] = [
      { id: 'home', label: t('navigation.home'), icon: Home, href: '/', section: 'navigation' },
      {
        id: 'shorts',
        label: t('navigation.shorts'),
        icon: Play,
        href: '/shorts',
        section: 'navigation',
      },
      ...(user
        ? [
            {
              id: 'subscriptions',
              label: t('navigation.subscriptions'),
              icon: Users,
              href: '/subscriptions',
              section: 'navigation' as const,
            },
          ]
        : []),
    ]

    const libraryItems: NavigationMenuItem[] = [
      {
        id: 'library',
        label: t('navigation.library'),
        icon: Library,
        href: '/library',
        section: 'library',
      },
      ...(user && isBetaUser(user.pubkey)
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

    const configurationItems: NavigationMenuItem[] = [
      {
        id: 'settings',
        label: t('navigation.settings'),
        icon: Cog,
        href: '/settings',
        section: 'configuration',
      },
    ]
    const compactItems = [...navigationItems, ...libraryItems, ...configurationItems]
    const mobilePrimaryItems = [...navigationItems, libraryItems[0]]
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
  }, [t, user])
}
