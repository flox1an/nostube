/// <reference types="vite/client" />

import 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'hls-video': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLVideoElement> & {
          src?: string
          poster?: string
          autoPlay?: boolean
          loop?: boolean
          crossOrigin?: string
          slot?: string
          onError?: (e: Event) => void
          onTimeUpdate?: (e: Event) => void
        },
        HTMLVideoElement
      >
      'media-controller': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          audio?: boolean
        },
        HTMLElement
      >
      'media-control-bar': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'media-play-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'media-mute-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'media-volume-range': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'media-time-display': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'media-time-range': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'media-playback-rate-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      'media-pip-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'media-fullscreen-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      'media-captions-menu': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          anchor?: string
        },
        HTMLElement
      >
      'media-captions-menu-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
    }
  }
}
