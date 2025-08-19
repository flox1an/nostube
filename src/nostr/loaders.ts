import { getTimelineLoader } from "./core";
import { VideoType } from '@/contexts/AppContext';
import { getKindsForType } from '@/lib/video-types';

// Kind 21 (videos)
export const videoLoader = () =>
  getTimelineLoader("k21", { kinds: getKindsForType('videos') });

// Kind 22 (shorts)
export const shortsLoader = () =>
  getTimelineLoader("k22", { kinds: getKindsForType('shorts') });

// Combined 21+22 (all video content)
export const allVideoLoader = () =>
  getTimelineLoader("k21k22", { kinds: getKindsForType('all') });

// By author (pubkey hex)
export const authorVideoLoader = (pubkey: string) =>
  getTimelineLoader(`k21:author:${pubkey}`, { kinds: getKindsForType('all'), authors: [pubkey] });

// By video type
export const videoTypeLoader = (type: VideoType) =>
  getTimelineLoader(`k21:type:${type}`, { kinds: getKindsForType(type) });

// By video type and author
export const authorVideoTypeLoader = (type: VideoType, pubkey: string) =>
  getTimelineLoader(`k21:type:${type}:author:${pubkey}`, { kinds: getKindsForType(type), authors: [pubkey] });

// Example: by hashtag/topic
export const tagVideoLoader = (tag: string) =>
  getTimelineLoader(`k21:tag:${tag}`, { kinds: getKindsForType('all'), "#t": [tag] });
