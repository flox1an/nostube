import { useState, useEffect, useMemo } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { X, Loader2, Trash, Upload, Link } from 'lucide-react';
import { useAppContext } from '@/hooks/useAppContext';
import { mirrorBlobsToServers, uploadFileToMultipleServers } from '@/lib/blossom-upload';
import { useDropzone } from 'react-dropzone';
import { BlobDescriptor } from 'blossom-client-sdk';
import { useNavigate } from 'react-router-dom';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { buildAdvancedMimeType, nowInSecs } from '@/lib/utils';
import { getCodecsFromFile, getCodecsFromUrl, type CodecInfo } from '@/lib/codec-detection';
import { Checkbox } from './ui/checkbox';
import { UploadServer } from './UploadServer';

export function VideoUpload() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [inputMethod, setInputMethod] = useState<'file' | 'url'>('file');
  const [videoUrl, setVideoUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [uploadInfo, setUploadInfo] = useState<{
    dimension?: string;
    sizeMB?: number;
    duration?: number;
    uploadedBlobs: BlobDescriptor[];
    mirroredBlobs: BlobDescriptor[];
    videoCodec?: string;
    audioCodec?: string;
    videoUrl?: string; // For URL-based videos
  }>({ uploadedBlobs: [], mirroredBlobs: [] });
  const [uploadState, setUploadState] = useState<'initial' | 'uploading' | 'finished'>('initial');
  const [thumbnailBlob, setThumbnailBlob] = useState<Blob | null>(null);
  const [thumbnailSource, setThumbnailSource] = useState<'generated' | 'upload'>('generated');
  const [thumbnailUploadInfo, setThumbnailUploadInfo] = useState<{
    uploadedBlobs: BlobDescriptor[];
    mirroredBlobs: BlobDescriptor[];
    uploading: boolean;
    error?: string;
  }>({ uploadedBlobs: [], mirroredBlobs: [], uploading: false });
  const [contentWarningEnabled, setContentWarningEnabled] = useState(false);
  const [contentWarningReason, setContentWarningReason] = useState('');

  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { publish } = useNostrPublish();
  const blossomInitalUploadServers = config.blossomServers?.filter(server => server.tags.includes('initial upload'));
  const blossomMirrorServers = config.blossomServers?.filter(server => server.tags.includes('mirror'));
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    // Check if we have either a file or URL
    if (inputMethod === 'file' && (!file || !blossomInitalUploadServers)) return;
    if (inputMethod === 'url' && !videoUrl) return;

    // Determine which thumbnail to use
    let thumbnailFile: File | null = null;
    if (thumbnailSource === 'generated') {
      if (!thumbnailBlob) return;
      // Convert Blob to File for upload
      thumbnailFile = new File([thumbnailBlob], 'thumbnail.jpg', {
        type: thumbnailBlob.type || 'image/jpeg',
        lastModified: Date.now(),
      });
    } else {
      if (!thumbnail) return;
      thumbnailFile = thumbnail;
    }

    if (inputMethod === 'file' && (!file || !(file instanceof File))) throw new Error('No valid video file selected');
    if (inputMethod === 'url' && !uploadInfo.videoUrl) throw new Error('No valid video URL provided');
    if (!thumbnailFile) throw new Error('No valid thumbnail file selected');

    try {
      const [width, height] = uploadInfo.dimension?.split('x').map(Number) || [0, 0];
      const kind = height > width ? 22 : 21;

      // Publish Nostr event (NIP-71)
      const videoUrl = inputMethod === 'url' ? uploadInfo.videoUrl : uploadInfo.uploadedBlobs?.[0].url;
      const imetaTag = [
        'imeta',
        `dim ${uploadInfo.dimension}`,
        `url ${videoUrl}`,
      ];

      // Add hash and mime type for uploaded files
      if (inputMethod === 'file' && uploadInfo.uploadedBlobs?.[0]) {
        imetaTag.push(`x ${uploadInfo.uploadedBlobs[0].sha256}`);
        imetaTag.push(`m ${buildAdvancedMimeType(file!.type, uploadInfo.videoCodec, uploadInfo.audioCodec)}`);
      } else if (inputMethod === 'url') {
        // For URL videos, we can't determine exact mime type without the file
        imetaTag.push(`m video/mp4`);
      }

      thumbnailUploadInfo.uploadedBlobs.forEach(blob => imetaTag.push(`image ${blob.url}`));
      thumbnailUploadInfo.mirroredBlobs.forEach(blob => imetaTag.push(`image ${blob.url}`));

      // Only add fallback URLs for uploaded files
      if (inputMethod === 'file') {
        if (uploadInfo.uploadedBlobs.length > 1) {
          for (const blob of uploadInfo.uploadedBlobs.slice(1)) {
            imetaTag.push(`fallback ${blob.url}`);
          }
        }
        if (uploadInfo.mirroredBlobs.length > 0) {
          for (const blob of uploadInfo.mirroredBlobs) {
            imetaTag.push(`fallback ${blob.url}`);
          }
        }
      }

      const event = {
        kind,
        content: description,
        created_at: nowInSecs(),
        tags: [
          ['title', title],
          ['alt', description],
          ['published_at', nowInSecs().toString()],
          ['duration', uploadInfo.duration?.toString() || '0'],
          imetaTag,
          // TODO remove
          // ['text-track', 'https://temp-st.apps2.slidestr.net/3ef2be82896a81037d4f31f789e5f3fc670f291fe18484f700557fc6bf82cfaa.vtt', 'en-US'],
          ...(contentWarningEnabled
            ? [['content-warning', contentWarningReason.trim() ? contentWarningReason : 'NSFW']]
            : []),
          ...tags.map(tag => ['t', tag]),
          ['client', 'nostube'],
        ],
      };

      /*
          ["text-track", "<encoded `kind 6000` event>", "<recommended relay urls>"],
          ["segment", <start>, <end>, "<title>", "<thumbnail URL>"],

    // participants
    ["p", "<32-bytes hex of a pubkey>", "<optional recommended relay URL>"],
    ["p", "<32-bytes hex of a pubkey>", "<optional recommended relay URL>"],

    // hashtags
    ["t", "<tag>"],
    ["t", "<tag>"],

    // reference links
    ["r", "<url>"],
    ["r", "<url>"]
    */

      await publish({
        event,
        relays: config.relays.filter(r => r.tags.includes('write')).map(r => r.url),
      });

      // Navigate to home or videos page since we don't have the event ID yet
      navigate('/');
      console.log(event);

      // Reset form
      setTitle('');
      setDescription('');
      setFile(null);
      setThumbnail(null);
      setTags([]);
      setTagInput('');
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };

  const addTagsFromInput = (input: string) => {
    // Split by spaces and filter out empty strings
    const newTags = input.split(/\s+/).filter(tag => tag.trim().length > 0);
    const uniqueNewTags = newTags.filter(tag => !tags.includes(tag.trim()));
    
    if (uniqueNewTags.length > 0) {
      setTags([...tags, ...uniqueNewTags.map(tag => tag.trim())]);
    }
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      addTagsFromInput(tagInput);
      setTagInput('');
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pastedText = e.clipboardData.getData('text');
    
    // Check if the pasted text contains spaces (likely multiple tags)
    if (pastedText.includes(' ')) {
      e.preventDefault();
      
      // Add any existing input as a tag first
      if (tagInput.trim()) {
        addTagsFromInput(tagInput);
      }
      
      // Add the pasted tags
      addTagsFromInput(pastedText);
      setTagInput('');
    }
    // If no spaces, let the default paste behavior handle it
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  // Check if URL is a Blossom URL and extract SHA256 hash
  const parseBlossomUrl = (url: string): { isBlossomUrl: boolean; sha256?: string; blossomServer?: string } => {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      
      // Blossom URLs typically have the format: https://server.com/{sha256}.{extension}
      // SHA256 hashes are 64 characters long (hex)
      const match = pathname.match(/\/([a-f0-9]{64})(?:\.[^/]*)?$/i);
      
      if (match) {
        const sha256 = match[1];
        const blossomServer = `${urlObj.protocol}//${urlObj.host}`;
        return {
          isBlossomUrl: true,
          sha256,
          blossomServer
        };
      }
      
      return { isBlossomUrl: false };
    } catch {
      return { isBlossomUrl: false };
    }
  };


  // Handle URL video processing
  const handleUrlVideoProcessing = async (url: string) => {
    if (!url) return;
    
    setUploadInfo({ uploadedBlobs: [], mirroredBlobs: [] });
    setUploadState('uploading');
    
    try {
      // Create a video element to extract metadata
      const video = document.createElement('video');
      video.src = url;
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(new Error('Failed to load video from URL'));
        
        // Set a timeout in case the video doesn't load
        setTimeout(() => reject(new Error('Video loading timeout')), 10000);
      });
      
      const duration = Math.round(video.duration);
      const dimensions = `${video.videoWidth}x${video.videoHeight}`;
      
      // Try to extract codec information
      const codecs = await getCodecsFromUrl(url);
      
      // Check if this is a Blossom URL and handle mirroring
      const blossomInfo = parseBlossomUrl(url);
      let mirroredBlobs: BlobDescriptor[] = [];
      
      if (blossomInfo.isBlossomUrl && blossomInfo.sha256 && user && blossomMirrorServers && blossomMirrorServers.length > 0) {
        try {
          // Create a BlobDescriptor for the Blossom URL
          const originalBlob: BlobDescriptor = {
            url: url,
            sha256: blossomInfo.sha256,
            size: 0, // Size unknown for URL-based videos
            type: 'video/mp4', // Assume MP4 for now
            uploaded: Date.now()
          };
          
          // Mirror to configured mirror servers
          mirroredBlobs = await mirrorBlobsToServers({
            mirrorServers: blossomMirrorServers.map(s => s.url),
            blob: originalBlob,
            signer: async draft => await user.signer.signEvent(draft),
          });
          
          console.log(`Mirrored Blossom URL to ${mirroredBlobs.length} servers`);
        } catch (error) {
          console.error('Failed to mirror Blossom URL:', error);
          // Continue without mirroring - not a critical failure
        }
      }
      
      setUploadInfo({
        dimension: dimensions,
        duration,
        uploadedBlobs: [],
        mirroredBlobs,
        videoUrl: url,
        videoCodec: codecs.videoCodec,
        audioCodec: codecs.audioCodec,
      });
      
      setUploadState('finished');
    } catch (error) {
      console.error('Failed to process video URL:', error);
      setUploadState('initial');
      setUploadInfo({ uploadedBlobs: [], mirroredBlobs: [] });
      // Could show error toast here
    }
  };

  // Thumbnail dropzone logic
  const handleThumbnailDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles[0] || !blossomInitalUploadServers || !user) return;
    setThumbnailUploadInfo({ uploadedBlobs: [], mirroredBlobs: [], uploading: true });
    try {
      // Upload to initial servers
      const uploadedBlobs = await uploadFileToMultipleServers({
        file: acceptedFiles[0],
        servers: blossomInitalUploadServers.map(server => server.url),
        signer: async draft => await user.signer.signEvent(draft),
      });
      // Mirror to mirror servers
      let mirroredBlobs: BlobDescriptor[] = [];
      if (blossomMirrorServers && blossomMirrorServers.length > 0 && uploadedBlobs[0]) {
        mirroredBlobs = await mirrorBlobsToServers({
          mirrorServers: blossomMirrorServers.map(s => s.url),
          blob: uploadedBlobs[0],
          signer: async draft => await user.signer.signEvent(draft),
        });
      }
      setThumbnailUploadInfo({ uploadedBlobs, mirroredBlobs, uploading: false });
      setThumbnail(acceptedFiles[0]);
    } catch {
      setThumbnailUploadInfo({
        uploadedBlobs: [],
        mirroredBlobs: [],
        uploading: false,
        error: 'Failed to upload thumbnail.',
      });
    }
  };
  const {
    getRootProps: getThumbRootProps,
    getInputProps: getThumbInputProps,
    isDragActive: isThumbDragActive,
  } = useDropzone({
    onDrop: handleThumbnailDrop,
    accept: { 'image/*': [] },
    multiple: false,
  });

  const handleThumbnailSourceChange = (value: string) => {
    setThumbnailSource(value as 'generated' | 'upload');
    if (value === 'generated') {
      setThumbnail(null); // clear uploaded file if switching to generated
    }
  };

  // Dropzone for video file
  const onDrop = async (acceptedFiles: File[]) => {
    if (
      acceptedFiles &&
      acceptedFiles[0] &&
      blossomInitalUploadServers &&
      blossomInitalUploadServers.length > 0 &&
      user
    ) {
      const file = acceptedFiles[0] ?? null;
      setFile(file);
      setUploadInfo({ uploadedBlobs: [], mirroredBlobs: [] });
      setUploadState('uploading');
      // Start upload automatically
      try {
        const uploadedBlobs = await uploadFileToMultipleServers({
          file: acceptedFiles[0],
          servers: blossomInitalUploadServers.map(server => server.url),
          signer: async draft => await user.signer.signEvent(draft),
        });
        // Calculate video duration and dimensions
        const video = document.createElement('video');
        video.src = URL.createObjectURL(acceptedFiles[0]);
        await new Promise(resolve => {
          video.onloadedmetadata = resolve;
        });
        const duration = Math.round(video.duration);
        const dimensions = `${video.videoWidth}x${video.videoHeight}`;
        const sizeMB = acceptedFiles[0].size / 1024 / 1024;

        // Extract codec info using MP4Box.js
        let codecs: CodecInfo = {};
        try {
          codecs = await getCodecsFromFile(acceptedFiles[0]);
        } catch {
          codecs = {};
        }

        setUploadInfo({
          dimension: dimensions,
          sizeMB: Number(sizeMB.toFixed(2)),
          duration,
          uploadedBlobs: uploadedBlobs,
          mirroredBlobs: [],
          videoCodec: codecs.videoCodec,
          audioCodec: codecs.audioCodec,
        });

        if (blossomMirrorServers && blossomMirrorServers.length > 0) {
          const mirroredBlobs = await mirrorBlobsToServers({
            mirrorServers: blossomMirrorServers.map(s => s.url),
            blob: uploadedBlobs[0], // TODO which blob to mirror?
            signer: async draft => await user.signer.signEvent(draft),
          });
          setUploadInfo(ui => ({
            ...ui,
            mirroredBlobs,
          }));
        }
      } catch {
        setUploadState('initial');
        setUploadInfo({ uploadedBlobs: [], mirroredBlobs: [] });
        // Optionally show error toast
      }
    }
    setUploadState('finished');
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/*': [] },
    multiple: false,
  });

  // Memoize the video URL for thumbnail generation (works for both uploaded files and URLs)
  const currentVideoUrl = useMemo(() => {
    if (inputMethod === 'url' && uploadInfo.videoUrl) {
      return uploadInfo.videoUrl;
    }
    return uploadInfo.uploadedBlobs && uploadInfo.uploadedBlobs.length > 0
      ? uploadInfo.uploadedBlobs[0].url
      : undefined;
  }, [inputMethod, uploadInfo.videoUrl, uploadInfo.uploadedBlobs]);

  // Generate thumbnail from video after upload using a headless video element
  useEffect(() => {
    async function createThumbnailFromUrl(videoUrl: string, seekTime = 1): Promise<Blob | null> {
      return new Promise<Blob | null>((resolve, reject) => {
        const video = document.createElement('video');
        video.src = videoUrl;
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';

        video.addEventListener(
          'loadedmetadata',
          () => {
            // Clamp seekTime to video duration
            const time = Math.min(seekTime, video.duration - 0.1);
            video.currentTime = time > 0 ? time : 0;
          },
          { once: true }
        );

        video.addEventListener(
          'seeked',
          () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.8);
          },
          { once: true }
        );

        video.addEventListener(
          'error',
          () => {
            reject(new Error('Failed to load video for thumbnail'));
          },
          { once: true }
        );
      });
    }

    if (currentVideoUrl) {
      setThumbnailBlob(null); // reset before generating new
      createThumbnailFromUrl(currentVideoUrl, 1)
        .then(blob => {
          if (blob) {
            setThumbnailBlob(blob);
          }
          return undefined;
        })
        .catch(() => {});
    } else {
      setThumbnailBlob(null);
    }
    // No cleanup needed, so return void
    return undefined;
  }, [currentVideoUrl]);

  // Memoize the thumbnail URL and clean up when thumbnailBlob changes
  const thumbnailUrl = useMemo(() => {
    if (!thumbnailBlob) return undefined;
    // TypeScript: thumbnailBlob is Blob, not null
    return URL.createObjectURL(thumbnailBlob as Blob);
  }, [thumbnailBlob]);

  useEffect(() => {
    return () => {
      if (thumbnailUrl) {
        URL.revokeObjectURL(thumbnailUrl);
      }
    };
  }, [thumbnailUrl]);

  // Reset all form fields and state
  const handleReset = () => {
    setTitle('');
    setDescription('');
    setTags([]);
    setTagInput('');
    setInputMethod('file');
    setVideoUrl('');
    setFile(null);
    setThumbnail(null);
    setUploadInfo({ uploadedBlobs: [], mirroredBlobs: [] });
    setUploadState('initial');
    setThumbnailBlob(null);
    setThumbnailSource('generated');
    setThumbnailUploadInfo({ uploadedBlobs: [], mirroredBlobs: [], uploading: false });
  };

  if (!user) {
    return <div>Please log in to upload videos</div>;
  }

  return (
    <Card>
      {/* Info bar above drop zone */}
      <div className="flex items-center justify-between bg-muted border border-muted-foreground/10 rounded px-4 py-2 mb-4">
        <div className="text-sm text-muted-foreground">
          Uploading directly to <b className="text-foreground">{blossomInitalUploadServers?.length ?? 0}</b> server
          {(blossomInitalUploadServers?.length ?? 0) === 1 ? '' : 's'}. Mirroring to{' '}
          <b className="text-foreground">{blossomMirrorServers?.length ?? 0}</b> server
          {(blossomMirrorServers?.length ?? 0) === 1 ? '' : 's'}.
        </div>
        <Button onClick={() => navigate('/settings')} variant={'outline'} className=" cursor-pointer">
          Configure servers
        </Button>
      </div>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-4">
          {/* Input method selection - hide after processing */}
          {uploadState === 'initial' && (
            <div className="flex flex-col gap-2">
              <Label>Video Source</Label>
              <RadioGroup
                value={inputMethod}
                onValueChange={(value: 'file' | 'url') => setInputMethod(value)}
                className="flex gap-6"
                aria-label="Video source method"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="file" id="file-upload" />
                  <Label htmlFor="file-upload" className="flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    Upload File
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="url" id="url-input" />
                  <Label htmlFor="url-input" className="flex items-center gap-2">
                    <Link className="w-4 h-4" />
                    From URL
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* URL input field - hide after processing */}
          {inputMethod === 'url' && uploadState !== 'finished' && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="video-url">Video URL</Label>
              <div className="flex gap-2">
                <Input
                  id="video-url"
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://example.com/video.mp4"
                  className="flex-1"
                />
                <Button
                  type="button"
                  onClick={() => handleUrlVideoProcessing(videoUrl)}
                  disabled={!videoUrl || uploadState === 'uploading'}
                >
                  {uploadState === 'uploading' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Process'}
                </Button>
              </div>
            </div>
          )}

          {/* Dropzone or video preview + info */}
          {(uploadInfo.uploadedBlobs && uploadInfo.uploadedBlobs.length > 0) || (inputMethod === 'url' && uploadInfo.videoUrl) ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div className="w-full">
                <video
                  controls
                  className="w-full rounded-lg border shadow max-h-[320px]"
                  poster={undefined}
                  crossOrigin="anonymous"
                >
                  {/* Main video source - either from URL or uploaded file */}
                  <source src={inputMethod === 'url' ? uploadInfo.videoUrl : uploadInfo.uploadedBlobs[0]?.url} />
                  {/* Fallback sources if more than one blob exists (only for uploaded files) */}
                  {inputMethod === 'file' && uploadInfo.uploadedBlobs.slice(1).map((blob, idx) => (
                    <source key={blob.url || idx} src={blob.url} />
                  ))}
                  Your browser does not support the video tag.
                </video>
              </div>
              <div>
                <div className="mt-0 p-3 bg-muted rounded border text-sm">
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 items-center">
                    <div className="text-muted-foreground">Dimension:</div>
                    <div>
                      <span className="font-mono">{uploadInfo.dimension}</span>
                    </div>
                    {inputMethod === 'file' && uploadInfo.sizeMB && (
                      <>
                        <div className="text-muted-foreground">Size:</div>
                        <div>
                          <span className="font-mono">{uploadInfo.sizeMB} MB</span>
                        </div>
                      </>
                    )}
                    <div className="text-muted-foreground">Duration:</div>
                    <div>
                      <span className="font-mono">{uploadInfo.duration} seconds</span>
                    </div>
                    {uploadInfo.videoCodec && (
                      <>
                        <div className="text-muted-foreground">Video Codec:</div>
                        <div>
                          <span className="font-mono">{uploadInfo.videoCodec}</span>
                        </div>
                        {uploadInfo.videoCodec.startsWith('av01') && (
                          <div className="col-span-2 mt-2 text-sm text-yellow-700 bg-yellow-100 border border-yellow-300 rounded p-2">
                            <b>Warning:</b> AV1 videos (<code>av01</code>) cannot be played on iOS or Safari browsers.
                            Please use H.264/AVC for maximum compatibility.
                          </div>
                        )}
                        {uploadInfo.videoCodec.startsWith('vp09') && (
                          <div className="col-span-2 mt-2 text-sm text-yellow-700 bg-yellow-100 border border-yellow-300 rounded p-2">
                            <b>Warning:</b> VP9 videos (<code>vp09</code>) are not supported on iOS or Safari browsers.
                            For maximum compatibility, use H.264/AVC.
                          </div>
                        )}
                        {uploadInfo.videoCodec.startsWith('hvc1') && (
                          <div className="col-span-2 mt-2 text-sm text-blue-800 bg-blue-100 border border-blue-300 rounded p-2">
                            <b>Info:</b> H.265/HEVC (<code>hvc1</code>) is widely supported. Only some de-googled Linux
                            browsers may have issues.
                          </div>
                        )}
                        {uploadInfo.videoCodec.startsWith('avc1') && (
                          <div className="col-span-2 mt-2 text-sm text-green-800 bg-green-100 border border-green-300 rounded p-2">
                            <b>Great:</b> H.264/AVC (<code>avc1</code>) is the most widely supported video codec and
                            will play on all browsers and devices.
                          </div>
                        )}
                      </>
                    )}

                    {uploadInfo.audioCodec && (
                      <>
                        <div className="text-muted-foreground">Audio Codec:</div>
                        <div>
                          <span className="font-mono">{uploadInfo.audioCodec}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : inputMethod === 'file' && blossomInitalUploadServers && blossomInitalUploadServers.length > 0 ? (
            <div
              className="mb-4"
              style={{
                display: uploadInfo.uploadedBlobs && uploadInfo.uploadedBlobs.length > 0 ? 'none' : undefined,
              }}
            >
              <div
                {...getRootProps()}
                className={
                  `flex flex-col items-center h-32 justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors ` +
                  (isDragActive ? 'border-primary bg-muted' : 'border-gray-300 bg-background hover:bg-muted')
                }
              >
                <input {...getInputProps()} />
                <span className="text-base text-muted-foreground">
                  {isDragActive ? 'Drop the video here...' : 'Drag & drop a video file here, or click to select'}
                </span>
                {file && (
                  <div className="mt-2 text-sm text-foreground">
                    <b>Selected:</b> {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </div>
                )}
              </div>
            </div>
          ) : inputMethod === 'file' ? (
            <div className="text-sm text-muted-foreground bg-yellow-50 border border-yellow-200 rounded p-3 mb-2">
              <span>
                You do not have any Blossom server tagged with <b>"initial upload"</b>.<br />
                Please go to{' '}
                <a href="/settings" className="underline text-blue-600">
                  Settings
                </a>{' '}
                and assign the <b>"initial upload"</b> tag to at least one server.
              </span>
            </div>
          ) : null}

          {/* Server upload/mirror status */}
          <UploadServer
            inputMethod={inputMethod}
            uploadState={uploadState}
            uploadedBlobs={uploadInfo.uploadedBlobs}
            mirroredBlobs={uploadInfo.mirroredBlobs}
            hasInitialUploadServers={!!(blossomInitalUploadServers && blossomInitalUploadServers.length > 0)}
          />

          {/* Show form fields only after upload has started */}
          {uploadState !== 'initial' && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" value={title} onChange={e => setTitle(e.target.value)} required />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="tags">Tags</Label>
                <Input
                  id="tags"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  onPaste={handlePaste}
                  onBlur={() => {
                    if (tagInput.trim()) {
                      addTagsFromInput(tagInput);
                      setTagInput('');
                    }
                  }}
                  placeholder="Press Enter to add tags, or paste space-separated tags"
                />
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="thumbnail">Thumbnail</Label>
                <RadioGroup
                  value={thumbnailSource}
                  onValueChange={handleThumbnailSourceChange}
                  className="flex gap-4 mb-2"
                  aria-label="Thumbnail source"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="generated" id="generated-thumb" />
                    <Label htmlFor="generated-thumb">Use generated thumbnail</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="upload" id="upload-thumb" />
                    <Label htmlFor="upload-thumb">Upload custom thumbnail</Label>
                  </div>
                </RadioGroup>
                {thumbnailSource === 'generated' && thumbnailBlob && (
                  <div className="mt-4">
                    <img src={thumbnailUrl} alt="Generated thumbnail" className="rounded border mt-2 max-h-[320px]" />
                  </div>
                )}
                {thumbnailSource === 'upload' && (
                  <div className="mb-2">
                    <div
                      {...getThumbRootProps()}
                      className={
                        `flex flex-col items-center h-24 justify-center mb-4 border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors ` +
                        (isThumbDragActive ? 'border-primary bg-muted' : 'border-gray-300 bg-background hover:bg-muted')
                      }
                    >
                      <input {...getThumbInputProps()} />
                      <span className="text-base text-muted-foreground">
                        {isThumbDragActive
                          ? 'Drop the thumbnail here...'
                          : 'Drag & drop a thumbnail image, or click to select'}
                      </span>
                    </div>

                    {thumbnailUploadInfo.error && (
                      <div className="text-red-600 text-sm mt-2">{thumbnailUploadInfo.error}</div>
                    )}
                    <UploadServer
                      inputMethod="file"
                      uploadState={thumbnailUploadInfo.uploading ? 'uploading' : 'finished'}
                      uploadedBlobs={thumbnailUploadInfo.uploadedBlobs}
                      mirroredBlobs={thumbnailUploadInfo.mirroredBlobs}
                      hasInitialUploadServers={true}
                      forceShow={thumbnailUploadInfo.uploadedBlobs.length > 0 || thumbnailUploadInfo.mirroredBlobs.length > 0}
                    />
                  </div>
                )}
                {/* Content warning option */}
                <div className="flex items-center gap-2 mt-4">
                  <Checkbox
                    id="content-warning"
                    defaultChecked={false}
                    required={false}
                    checked={contentWarningEnabled}
                    onCheckedChange={e => setContentWarningEnabled(e as boolean)}
                  />
                  <Label htmlFor="content-warning">Mark as NSFW / add content warning</Label>
                </div>
                {contentWarningEnabled && (
                  <div className="flex flex-col gap-1 mt-2">
                    <Label htmlFor="content-warning-reason">Reason (optional)</Label>
                    <Input
                      id="content-warning-reason"
                      value={contentWarningReason}
                      onChange={e => setContentWarningReason(e.target.value)}
                      placeholder="e.g. nudity, violence, etc."
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={handleReset} title="Reset form" aria-label="Reset form">
            <Trash className="w-5 h-5" />
          </Button>
          <Button
            type="submit"
            disabled={
              (inputMethod === 'file' && (!uploadInfo.uploadedBlobs || uploadInfo.uploadedBlobs.length === 0)) ||
              (inputMethod === 'url' && !uploadInfo.videoUrl) ||
              !title ||
              !thumbnailSource ||
              !thumbnailBlob
            }
          >
            Publish video
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
