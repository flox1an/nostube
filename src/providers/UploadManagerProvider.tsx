/**
 * Upload Manager Provider
 *
 * Re-exports from the modularized upload/ directory.
 * This file exists for backward compatibility with existing imports.
 */

export {
  UploadManagerProvider,
  useUploadManager,
  type UploadManagerContextType,
  type TranscodeJob,
  type ResolutionQueueInfo,
} from './upload'
