import type { MouseEvent, PropsWithChildren } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import type { DesktopWindowCoordinator } from './window-coordinator'

type DesktopVideoLinkProps = PropsWithChildren<
  LinkProps & {
    desktopCoordinator?: DesktopWindowCoordinator
    desktopRoute?: string
  }
>

export function DesktopVideoLink({
  children,
  desktopCoordinator,
  desktopRoute,
  onClick,
  ...linkProps
}: DesktopVideoLinkProps) {
  const handleClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented || !desktopCoordinator || !desktopRoute) return

    event.preventDefault()
    await desktopCoordinator.openPlayer(desktopRoute)
  }

  return (
    <Link {...linkProps} onClick={handleClick}>
      {children}
    </Link>
  )
}
