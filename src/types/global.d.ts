declare global {
  namespace JSX {
    interface IntrinsicElements {
      'media-controller': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'media-settings-menu': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        hidden?: boolean
        anchor?: string
      }
      'media-settings-menu-item': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      'media-playback-rate-menu': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        hidden?: boolean
      }
      'media-rendition-menu': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        hidden?: boolean
      }
      'media-playback-rate-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      'media-settings-menu-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      'media-play-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'media-mute-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'media-volume-range': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'media-time-display': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'media-time-range': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'media-pip-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'media-fullscreen-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      'media-control-bar': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>

      'media-captions-menu': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'media-captions-menu-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
    }
  }
}

interface BlossomServer {
  url: string
  name: string
  tags: ('mirror' | 'initial upload')[]
}

type BlossomServerTag = 'mirror' | 'initial upload'

interface CachingServer {
  url: string
  name: string
}

interface AppConfig {
  blossomServers?: BlossomServer[]
  cachingServers?: CachingServer[]
}
