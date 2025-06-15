/* eslint-disable @typescript-eslint/no-empty-interface */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "media-controller": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
} 