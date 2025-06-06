import { SimplePool } from "nostr-tools";
import type { NostrEvent } from "@nostrify/nostrify";

interface VideoCache {
  id: string;
  identifier: string;
  title: string;
  description: string;
  thumb: string;
  pubkey: string;
  created_at: number;
  duration: number;
  tags: string[];
  searchText: string;
}

let videos: VideoCache[] = [];
const pool = new SimplePool();
const BATCH_SIZE = 50;
let isLoading = false;
let hasMoreVideos = true;

// Track last timestamp per relay
const relayTimestamps = new Map<string, number>();

// Relay URLs - can be configured via message
let relayUrls = [
  "wss://relay.nostr.band",
  "wss://nos.lol",
  "wss://relay.damus.io",
  "wss://haven.slidestr.net",
];

// Create an in-memory index for fast text search
function createSearchIndex(video: VideoCache): string {
  return `${video.title} ${video.description} ${video.tags.join(
    " "
  )}`.toLowerCase();
}

// Process Nostr events into cache entries
function processEvents(events: NostrEvent[]): VideoCache[] {
  return events
    .map((event) => {
      const title = event.tags.find((t) => t[0] === "title")?.[1] || "";
      const description =
        event.tags.find((t) => t[0] === "description")?.[1] ||
        event.content ||
        "";
      const thumb = event.tags.find((t) => t[0] === "thumb")?.[1] || "";
      const duration = parseInt(
        event.tags.find((t) => t[0] === "duration")?.[1] || "0"
      );
      const identifier = event.tags.find((t) => t[0] === "d")?.[1] || "";
      const tags = event.tags.filter((t) => t[0] === "t").map((t) => t[1]);

      const video = {
        id: event.id,
        identifier,
        title,
        description,
        thumb,
        pubkey: event.pubkey,
        created_at: event.created_at,
        duration,
        tags,
        searchText: "",
      };

      // Create search index
      video.searchText = createSearchIndex(video);

      return video;
    })
    .filter((video) => video.title && video.thumb && video.identifier);
}

async function loadVideoBatch(): Promise<boolean> {
  try {
    // Query each relay separately to handle pagination per relay
    const results = await Promise.all(
      relayUrls.map(async (relayUrl) => {
        const lastTimestamp = relayTimestamps.get(relayUrl);
        const filter = {
          kinds: [34235,34236,21,22],
          limit: BATCH_SIZE,
          ...(lastTimestamp ? { until: lastTimestamp } : {}),
        };

        const events = await pool.querySync([relayUrl], filter);
        
        if (events.length > 0) {
          // Update last timestamp for this relay
          const minTimestamp = Math.min(...events.map((e) => e.created_at));
          relayTimestamps.set(relayUrl, minTimestamp);
        }

        return events;
      })
    );

    // Flatten and deduplicate events from all relays
    const allEvents = results.flat();
    const uniqueEvents = Array.from(
      new Map(allEvents.map((event) => [event.id, event])).values()
    );

    if (uniqueEvents.length === 0) {
      hasMoreVideos = false;
      return false;
    }

    // Process and add new videos
    const newVideos = processEvents(uniqueEvents);
    
    // Filter out duplicates based on id
    const existingIds = new Set(videos.map((v) => v.id));
    const uniqueNewVideos = newVideos.filter((v) => !existingIds.has(v.id));

    videos = [...videos, ...uniqueNewVideos];

    // Update all tags
    const allTags = new Set<string>();
    videos.forEach((video) => {
      video.tags.forEach((tag) => allTags.add(tag));
    });

    // Check if any relay still has more events
    const hasMore = relayUrls.some((relayUrl) => {
      const lastTimestamp = relayTimestamps.get(relayUrl);
      return lastTimestamp !== undefined;
    });

    // Notify about progress
    self.postMessage({
      type: "LOAD_PROGRESS",
      count: videos.length,
      hasMore,
      tags: Array.from(allTags),
    });

    return hasMore;
  } catch (error) {
    console.error("Error loading videos:", error);
    return false;
  }
}

async function startLoading() {
  if (isLoading) return;
  
  isLoading = true;
  relayTimestamps.clear();

  await loadVideoBatch();

  isLoading = false;
  self.postMessage({ type: "LOAD_COMPLETE", count: videos.length });
}

// Handle messages from main thread
self.onmessage = async (e: MessageEvent) => {
  const { type, data } = e.data;
  let query: string;
  let tags: string[];
  let results: VideoCache[];
  let allTags: Set<string>;

  switch (type) {
    case "INIT":
      if (data.relayUrls) {
        relayUrls = data.relayUrls;
      }
      await startLoading();
      self.postMessage({
        type: "SEARCH_RESULTS",
        results: videos,
      });
      break;

    case "LOAD_MORE":
      console.log("Loading more videos", isLoading, hasMoreVideos);

      if (!isLoading && hasMoreVideos) {
        await loadVideoBatch();
      }
      break;

    case "SEARCH":
      query = data.toLowerCase();
      results = query
        ? videos.filter((video) => video.searchText.includes(query))
        : videos;

      self.postMessage({
        type: "SEARCH_RESULTS",
        results: results,
      });
      break;

    case "FILTER_TAGS":
      tags = data as string[];
      results = tags.length
        ? videos.filter((video) =>
            tags.every((tag) => video.tags.includes(tag))
          )
        : videos;

      self.postMessage({
        type: "SEARCH_RESULTS",
        results: results,
      });
      break;

    case "GET_ALL_TAGS":
      allTags = new Set<string>();
      videos.forEach((video) => {
        video.tags.forEach((tag) => allTags.add(tag));
      });
      self.postMessage({
        type: "ALL_TAGS",
        tags: Array.from(allTags),
      });
      break;

    case "CLEAR_CACHE":
      videos = [];
      relayTimestamps.clear();
      hasMoreVideos = true;
      await startLoading();
      break;
  }
};
