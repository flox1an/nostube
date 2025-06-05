import { SimplePool, Relay } from "nostr-tools";
import type { NostrEvent } from '@nostrify/nostrify';

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
const BATCH_SIZE = 500;
let isLoading = false;
let hasMoreVideos = true;
let lastTimestamp: number | undefined;

// Relay URLs - can be configured via message
let relayUrls = [
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.damus.io',
];

// Create an in-memory index for fast text search
function createSearchIndex(video: VideoCache): string {
  return `${video.title} ${video.description} ${video.tags.join(' ')}`.toLowerCase();
}

// Process Nostr events into cache entries
function processEvents(events: NostrEvent[]): VideoCache[] {
  return events
    .map(event => {
      const title = event.tags.find(t => t[0] === 'title')?.[1] || '';
      const description = event.tags.find(t => t[0] === 'description')?.[1] || event.content || '';
      const thumb = event.tags.find(t => t[0] === 'thumb')?.[1] || '';
      const duration = parseInt(event.tags.find(t => t[0] === 'duration')?.[1] || '0');
      const identifier = event.tags.find(t => t[0] === 'd')?.[1] || '';
      const tags = event.tags.filter(t => t[0] === 't').map(t => t[1]);

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
        searchText: ''
      };

      // Create search index
      video.searchText = createSearchIndex(video);

      return video;
    })
    .filter(video => video.title && video.thumb && video.identifier);
}

async function loadVideoBatch(): Promise<boolean> {
  try {
    const filter = {
      kinds: [34235],
      limit: BATCH_SIZE,
      ...(lastTimestamp ? { until: lastTimestamp } : {}),
    };

    const events = await pool.querySync(relayUrls, filter);

    if (events.length === 0) {
      hasMoreVideos = false;
      return false;
    }

    // Update last timestamp for next batch
    lastTimestamp = Math.min(...events.map(e => e.created_at));

    // Process and add new videos
    const newVideos = processEvents(events);
    
    // Filter out duplicates based on id
    const existingIds = new Set(videos.map(v => v.id));
    const uniqueNewVideos = newVideos.filter(v => !existingIds.has(v.id));
    
    videos = [...videos, ...uniqueNewVideos];

    // Update all tags
    const allTags = new Set<string>();
    videos.forEach(video => {
      video.tags.forEach(tag => allTags.add(tag));
    });

    // Notify about progress
    self.postMessage({
      type: 'LOAD_PROGRESS',
      count: videos.length,
      hasMore: events.length === BATCH_SIZE,
      tags: Array.from(allTags)
    });

    return events.length === BATCH_SIZE;
  } catch (error) {
    console.error('Error loading videos:', error);
    return false;
  }
}

async function startLoading() {
  if (isLoading) return;
  
  isLoading = true;
  hasMoreVideos = true;
  lastTimestamp = undefined;

  while (hasMoreVideos) {
    hasMoreVideos = await loadVideoBatch();
    
    // Small delay to prevent overwhelming the relays
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  isLoading = false;
  self.postMessage({ type: 'LOAD_COMPLETE', count: videos.length });
}

// Handle messages from main thread
self.onmessage = async (e: MessageEvent) => {
  const { type, data } = e.data;

  switch (type) {
    case 'INIT':
      if (data.relayUrls) {
        relayUrls = data.relayUrls;
      }
      await startLoading();
      break;

    case 'LOAD_MORE':
      if (!isLoading && hasMoreVideos) {
        await loadVideoBatch();
      }
      break;

    case 'SEARCH':
      const query = data.toLowerCase();
      const results = query
        ? videos.filter(video => video.searchText.includes(query))
        : videos;

      self.postMessage({ 
        type: 'SEARCH_RESULTS',
        results: results
      });
      break;

    case 'FILTER_TAGS':
      const tags = data as string[];
      const tagResults = tags.length
        ? videos.filter(video => tags.every(tag => video.tags.includes(tag)))
        : videos;

      self.postMessage({
        type: 'SEARCH_RESULTS',
        results: tagResults
      });
      break;

    case 'GET_ALL_TAGS':
      const allTags = new Set<string>();
      videos.forEach(video => {
        video.tags.forEach(tag => allTags.add(tag));
      });
      self.postMessage({
        type: 'ALL_TAGS',
        tags: Array.from(allTags)
      });
      break;

    case 'CLEAR_CACHE':
      videos = [];
      lastTimestamp = undefined;
      hasMoreVideos = true;
      await startLoading();
      break;
  }
};