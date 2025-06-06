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
let lastTimestamp: number | undefined;

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
    const filter = {
      kinds: [34235],
      limit: BATCH_SIZE,
      ...(lastTimestamp ? { until: lastTimestamp } : {}),
    };
    console.log("filter", filter);

    const events = await pool.querySync(relayUrls, filter);

    console.log("events", events.length);
    if (events.length === 0) {
      hasMoreVideos = false;
      return false;
    }

    // Update last timestamp for next batch
    lastTimestamp = Math.min(...events.map((e) => e.created_at));

    // Process and add new videos
    const newVideos = processEvents(events);

    // Filter out duplicates based on id
    const existingIds = new Set(videos.map((v) => v.id));
    const uniqueNewVideos = newVideos.filter((v) => !existingIds.has(v.id));

    videos = [...videos, ...uniqueNewVideos];

    // Update all tags
    const allTags = new Set<string>();
    videos.forEach((video) => {
      video.tags.forEach((tag) => allTags.add(tag));
    });

    // Notify about progress
    self.postMessage({
      type: "LOAD_PROGRESS",
      count: videos.length,
      hasMore: events.length > 0,
      tags: Array.from(allTags),
    });

    return events.length > 0;
  } catch (error) {
    console.error("Error loading videos:", error);
    return false;
  }
}

async function startLoading() {
  if (isLoading) return;

  isLoading = true;
  lastTimestamp = undefined;

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
      self.postMessage({
        type: "SEARCH_RESULTS",
        results: videos,
      });
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
      lastTimestamp = undefined;
      hasMoreVideos = true;
      await startLoading();
      break;
  }
};
