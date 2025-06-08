import { blurHashToDataURL } from "@/workers/blurhashDataURL";
import type { NostrEvent } from "@nostrify/nostrify";
import { nip19 } from "nostr-tools";

export interface VideoEvent {
  id: string;
  kind: number;
  title: string;
  description: string;
  thumb: string;
  pubkey: string;
  created_at: number;
  duration: number;
  tags: string[];
  searchText: string;
  url?: string;
  mimeType?: string;
  dimensions?: string;
  size?: number;
  link: string;
}

const videoThumbService = "https://video-thumb.apps2.slidestr.net";

// Create an in-memory index for fast text search
function createSearchIndex(video: VideoEvent): string {
  return `${video.title} ${video.description} ${video.tags.join(
    " "
  )}`.toLowerCase();
}
// Process Nostr events into cache entries
export function processEvents(
  events: NostrEvent[],
  relays: string[]
): VideoEvent[] {
  return events
    .map((event) => processEvent(event, relays))
    .filter(
      (video): video is VideoEvent =>
        video !== undefined &&
        Boolean(video.id) &&
        Boolean(video.url) &&
        video?.url !== undefined &&
        video.url.indexOf("youtube.com") < 0
    );
}

export function processEvent(
  event: NostrEvent,
  relays: string[]
): VideoEvent | undefined {
  // First check for imeta tag
  const imetaTag = event.tags.find((t) => t[0] === "imeta");

  if (imetaTag) {
    // Parse imeta tag values
    const imetaValues = new Map<string, string>();
    for (let i = 1; i < imetaTag.length; i++) {
      const [key, value] = imetaTag[i].split(" ");
      if (key && value) {
        imetaValues.set(key, value);
      }
    }

    const url = imetaValues.get("url");
    const mimeType = imetaValues.get("m");
    const image = imetaValues.get("image");
    const thumb = imetaValues.get("thumb");

    const alt = imetaValues.get("alt") || event.content || "";
    const blurhash = imetaValues.get("blurhash");
    const identifier = event.tags.find((t) => t[0] === "d")?.[1] || "";
    const tags = event.tags.filter((t) => t[0] === "t").map((t) => t[1]);
    const duration = parseInt(
      event.tags.find((t) => t[0] === "duration")?.[1] || "0"
    );
    // Only process if it's a video
    //if (!url || !mimeType?.startsWith('video/')) return null;

    const video = {
      id: event.id,
      kind: event.kind,
      identifier,
      title: event.tags.find((t) => t[0] === "title")?.[1] || alt,
      description: event.content || "",
      thumb:
        image ||
        thumb ||
        `${videoThumbService}/${url}` ||
        blurHashToDataURL(blurhash) ||
        "",
      pubkey: event.pubkey,
      created_at: event.created_at,
      duration,
      tags,
      searchText: "",
      url,
      mimeType,
      link: nip19.neventEncode({
        kind: event.kind,
        id: event.id,
        relays,
      }),
    };

    // Create search index
    video.searchText = createSearchIndex(video);
    console.log("event", event, video);

    return video;
  } else {
    // Fall back to old format
    const title = event.tags.find((t) => t[0] === "title")?.[1] || "";
    const description =
      event.tags.find((t) => t[0] === "description")?.[1] ||
      event.content ||
      "";
    const thumb = event.tags.find((t) => t[0] === "thumb")?.[1];
    const duration = parseInt(
      event.tags.find((t) => t[0] === "duration")?.[1] || "0"
    );
    const identifier = event.tags.find((t) => t[0] === "d")?.[1] || "";
    const tags = event.tags.filter((t) => t[0] === "t").map((t) => t[1]);
    const url = event.tags.find((t) => t[0] === "url")?.[1] || "";
    const mimeType = event.tags.find((t) => t[0] === "m")?.[1] || "";

    const video = {
      id: event.id,
      kind: event.kind,
      identifier,
      title,
      description,
      thumb: thumb || `${videoThumbService}/${url}`,
      pubkey: event.pubkey,
      created_at: event.created_at,
      duration,
      tags,
      searchText: "",
      url,
      mimeType,
      dimensions: event.tags.find((t) => t[0] === "dim")?.[1],
      size: parseInt(event.tags.find((t) => t[0] === "size")?.[1] || "0"),
      link: nip19.neventEncode({
        kind: event.kind,
        id: event.id,
        relays,
      }),
    };

    // Create search index
    video.searchText = createSearchIndex(video);

    console.log("event", event, video);

    return video;
  }
}
