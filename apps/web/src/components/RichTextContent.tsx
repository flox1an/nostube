import { nip19 } from 'nostr-tools'
import {
  RichTextContent as SharedRichTextContent,
  type RichTextContentProps as SharedProps,
  type RichTextLinks,
} from '@nostube/widgets/components/RichTextContent'
import { buildProfilePath, buildProfileUrlFromPubkey } from '@/lib/nprofile'
import { buildVideoPath, buildVideoUrl } from '@/utils/video-utils'

const VIDEO_KINDS = new Set([21, 22, 34235, 34236])

/** nostube links into its own routes: profiles, tags, videos at a time, videos by reference. */
const nostubeLinks: RichTextLinks = {
  profile: ({ pubkey, relays }) => ({
    to:
      relays.length > 0
        ? buildProfileUrlFromPubkey(pubkey, relays)
        : buildProfilePath(nip19.npubEncode(pubkey)),
  }),
  hashtag: tag => ({ to: `/tag/${tag}` }),
  timestamp: (videoLink, seconds) => ({
    to: buildVideoUrl(videoLink, 'video', { timestamp: seconds }),
  }),
  // Only videos have a page here; any other note stays plain text.
  event: reference =>
    reference.kind !== undefined && VIDEO_KINDS.has(reference.kind)
      ? { to: buildVideoPath(reference.nip19) }
      : null,
}

export type RichTextContentProps = Omit<SharedProps, 'links'>

/** Rich text for nostube: the shared renderer with nostube's routes as link targets. */
export function RichTextContent(props: RichTextContentProps) {
  return <SharedRichTextContent {...props} links={nostubeLinks} />
}
