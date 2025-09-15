import { ReportedPubkeys } from '@/hooks/useReportedPubkeys';
import { getTypeForKind, VideoType } from '@/lib/video-types';
import { blurHashToDataURL } from '@/workers/blurhashDataURL';
import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

export type TextTrack = {
  lang: string;
  url: string;
};

export interface VideoEvent {
  id: string;
  kind: number;
  identifier?: string;
  title: string;
  description: string;
  images: string[];
  pubkey: string;
  created_at: number;
  duration: number;
  tags: string[];
  searchText: string;
  urls: string[];
  mimeType?: string;
  dimensions?: string;
  size?: number;
  link: string;
  type: VideoType;
  textTracks: TextTrack[];
  contentWarning: string | undefined;
  x?: string;
}

const videoThumbService = 'https://video-thumb.apps3.slidestr.net/thumbnail?url=';

// Create an in-memory index for fast text search
function createSearchIndex(video: VideoEvent): string {
  return `${video.title} ${video.description} ${video.tags.join(' ')}`.toLowerCase();
}
// Process Nostr events into cache entries
export function processEvents(events: NostrEvent[], relays: string[], blockPubkeys?: ReportedPubkeys): VideoEvent[] {
  return events
    .map(event => processEvent(event, relays))
    .filter(
      (video): video is VideoEvent =>
        video !== undefined &&
        Boolean(video.id) &&
        Boolean(video.urls) &&
        video?.urls !== undefined &&
        video.urls[0]?.indexOf('youtube.com') < 0 &&
        (!blockPubkeys || !blockPubkeys[video.pubkey])
    );
}

export function processEvent(event: NostrEvent, relays: string[]): VideoEvent | undefined {
  // First check for imeta tag
  const imetaTag = event.tags.find(t => t[0] === 'imeta');
  const contentWarning = event.tags.find(t => t[0] == 'content-warning')?.[1];

  if (imetaTag) {
    // Parse imeta tag values
    const imetaValues = new Map<string, string[]>();
    for (let i = 1; i < imetaTag.length; i++) {
      const firstSpace = imetaTag[i].indexOf(' ');
      let key: string | undefined, value: string | undefined;
      if (firstSpace !== -1) {
        key = imetaTag[i].slice(0, firstSpace);
        value = imetaTag[i].slice(firstSpace + 1);
      } else {
        key = imetaTag[i];
        value = undefined;
      }
      if (key && value) {
        if (!imetaValues.has(key)) {
          imetaValues.set(key, [value]);
        } else {
          imetaValues.get(key)!.push(value);
        }
      }
    }

    let url = imetaValues.get('url')?.[0];
    const mimeType: string | undefined = imetaValues.get('m')?.[0];

    const images: string[] = [];
    imetaValues.get('image')?.forEach(url => images.push(url));

    const videoUrls: string[] = url ? [url] : [];
    imetaValues.get('fallback')?.forEach(url => videoUrls.push(url));
    // mirror is bullshit, AI has created fuxx0rd events. Remove soon:
    imetaValues.get('mirror')?.forEach(url => videoUrls.push(url));

    const alt = imetaValues.get('alt')?.[0] || event.content || '';
    const blurhash = imetaValues.get('blurhash')?.[0];
    const x = imetaValues.get('x')?.[0];

    const tags = event.tags.filter(t => t[0] === 't').map(t => t[1]);
    const duration = parseInt(event.tags.find(t => t[0] === 'duration')?.[1] || '0');
    // Only process if it's a video
    //if (!url || !mimeType?.startsWith('video/')) return null;

    const textTracks: TextTrack[] = [];
    const textTrackTags = event.tags.filter(t => t[0] === 'text-track');
    textTrackTags.forEach(vtt => {
      const [_, url, lang] = vtt;
      textTracks.push({ url, lang });
    });

    // There are some events that have the whole imeta data in the first string.
    if (url && url.includes(' ')) {
      console.warn('URL with space', url, event);
      url = url.split(' ')[0];
    }

    const videoEvent: VideoEvent = {
      id: event.id,
      kind: event.kind,
      title: event.tags.find(t => t[0] === 'title')?.[1] || alt,
      description: event.content || '',
      images:
        images.length > 0 ? images : [(url ? `${videoThumbService}${btoa(url)}` : '') || blurHashToDataURL(blurhash) || ''],
      pubkey: event.pubkey,
      created_at: event.created_at,
      duration,
      x,
      tags,
      searchText: '',
      urls: videoUrls,
      mimeType,
      textTracks,
      link: nip19.neventEncode({
        kind: event.kind,
        id: event.id,
        relays,
      }),
      type: getTypeForKind(event.kind),
      contentWarning,
    };

    // Create search index
    videoEvent.searchText = createSearchIndex(videoEvent);

    return videoEvent;
  } else {
    // Fall back to old format
    const title = event.tags.find(t => t[0] === 'title')?.[1] || '';
    const description = event.tags.find(t => t[0] === 'description')?.[1] || event.content || '';
    const thumb = event.tags.find(t => t[0] === 'thumb')?.[1];
    const duration = parseInt(event.tags.find(t => t[0] === 'duration')?.[1] || '0');
    const identifier = event.tags.find(t => t[0] === 'd')?.[1] || '';
    const tags = event.tags.filter(t => t[0] === 't').map(t => t[1]);
    let url = event.tags.find(t => t[0] === 'url')?.[1] || '';
    const mimeType = event.tags.find(t => t[0] === 'm')?.[1] || '';

    // There are some events that have the whole imeta data in the first string.
    if (url.includes(' ')) {
      console.warn('URL with space', url, event);
      url = url.split(' ')[0];
    }

    const videoEvent: VideoEvent = {
      id: event.id,
      kind: event.kind,
      identifier,
      title,
      description,
      images: [thumb || `${videoThumbService}${btoa(url)}`],
      pubkey: event.pubkey,
      created_at: event.created_at,
      duration,
      tags,
      searchText: '',
      urls: [url],
      textTracks: [],
      mimeType,
      dimensions: event.tags.find(t => t[0] === 'dim')?.[1],
      size: parseInt(event.tags.find(t => t[0] === 'size')?.[1] || '0'),
      link: nip19.neventEncode({
        kind: event.kind,
        id: event.id,
        relays,
      }),
      type: getTypeForKind(event.kind),
      contentWarning,
    };

    // Create search index
    videoEvent.searchText = createSearchIndex(videoEvent);

    return videoEvent;
  }
}
