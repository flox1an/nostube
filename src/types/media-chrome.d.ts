// Media-chrome controller attributes
interface MediaControllerAttributes {
  nohotkeys?: boolean
  audio?: boolean
  autohide?: number | string
  defaultsubtitles?: boolean
  defaultstreamtype?: string
  defaultduration?: number | string
  fullscreenelement?: string
  hotkeys?: string
  keysused?: string
  liveedgeoffset?: number | string
  seektoliveoffset?: number | string
  noautoseektolive?: boolean
  novolumepref?: boolean
  nomutedpref?: boolean
  nosubtitleslangpref?: boolean
  nodefaultstore?: boolean
  lang?: string
}

declare global {
  interface HTMLElementTagNameMap {
    'media-controller': HTMLElement
    'media-video': HTMLVideoElement
    'media-poster-image': HTMLElement
    'media-loading-indicator': HTMLElement
    'media-play-button': HTMLElement
    'media-seek-backward-button': HTMLElement
    'media-seek-forward-button': HTMLElement
    'media-mute-button': HTMLElement
    'media-volume-range': HTMLElement
    'media-time-range': HTMLElement
    'media-time-display': HTMLElement
    'media-duration-display': HTMLElement
    'media-fullscreen-button': HTMLElement
    'media-pip-button': HTMLElement
    'media-playback-rate-button': HTMLElement
    'media-control-bar': HTMLElement
    'media-captions-menu': HTMLElement
    'media-captions-menu-button': HTMLElement
    'hls-video': HTMLVideoElement
  }

  interface MediaChromeButtonElement extends HTMLElement {
    part?: string
    'aria-label'?: string
  }

  namespace JSX {
    interface IntrinsicElements {
      'media-controller': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & MediaControllerAttributes,
        HTMLElement
      >
      'media-video': React.DetailedHTMLProps<
        React.VideoHTMLAttributes<HTMLVideoElement>,
        HTMLVideoElement
      >
      'media-poster-image': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'media-loading-indicator': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      'media-play-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'media-seek-backward-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      'media-seek-forward-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      'media-mute-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'media-volume-range': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'media-time-range': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'media-time-display': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'media-duration-display': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      'media-fullscreen-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      'media-pip-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'media-playback-rate-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      'media-control-bar': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'media-captions-menu': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        hidden?: boolean
        anchor?: string
      }
      'media-captions-menu-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      'hls-video': React.DetailedHTMLProps<
        React.VideoHTMLAttributes<HTMLVideoElement>,
        HTMLVideoElement
      >
    }

    interface HTMLAttributes<_T> {
      part?: string
    }
  }
}

export {}
