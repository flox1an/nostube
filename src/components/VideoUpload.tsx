import { useState, useEffect, useMemo } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  X,
  Loader2,
  Trash,
  Check,
  ExternalLink,
} from "lucide-react";
import { useAppContext } from "@/hooks/useAppContext";
import {
  mirrorBlobsToServers,
  uploadFileToMultipleServers,
} from "@/lib/blossom-upload";
import { useDropzone } from "react-dropzone";
import { BlobDescriptor } from "blossom-client-sdk";
import { useNavigate } from "react-router-dom";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import * as MP4Box from "mp4box";
import type { Movie } from "mp4box";
import { nip19 } from "nostr-tools";
import { nowInSecs } from "@/lib/utils";

export function VideoUpload() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
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
  }>({ uploadedBlobs: [], mirroredBlobs: [] });
  const [uploadStarted, setUploadStarted] = useState(false);
  const [thumbnailBlob, setThumbnailBlob] = useState<Blob | null>(null);
  const [thumbnailSource, setThumbnailSource] = useState<
    "generated" | "upload"
  >("generated");

  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { mutate: publish } = useNostrPublish();
  const blossomInitalUploadServers = config.blossomServers?.filter((server) =>
    server.tags.includes("initial upload")
  );
  const blossomMirrorServers = config.blossomServers?.filter((server) =>
    server.tags.includes("mirror")
  );
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !user || !blossomInitalUploadServers) return;

    // Determine which thumbnail to use
    let thumbnailFile: File | null = null;
    if (thumbnailSource === "generated") {
      if (!thumbnailBlob) return;
      // Convert Blob to File for upload
      thumbnailFile = new File([thumbnailBlob], "thumbnail.jpg", {
        type: thumbnailBlob.type || "image/jpeg",
        lastModified: Date.now(),
      });
    } else {
      if (!thumbnail) return;
      thumbnailFile = thumbnail;
    }

    if (!file || !(file instanceof File))
      throw new Error("No valid video file selected");
    if (!thumbnailFile) throw new Error("No valid thumbnail file selected");

    try {
      const [width, height] = uploadInfo.dimension?.split("x").map(Number) || [
        0, 0,
      ];
      const kind = height > width ? 22 : 21;

      const thumbnailBlobs = await uploadFileToMultipleServers({
        file: thumbnailFile,
        servers: blossomInitalUploadServers.map((server) => server.url),
        signer: async (draft) => await user.signer.signEvent(draft),
      });

      // Publish Nostr event (NIP-71)
      const imetaTag = [
        "imeta",
        `dim ${uploadInfo.dimension}`,
        `url ${uploadInfo.uploadedBlobs?.[0].url}`,
        `m ${file.type}`,
        ...(thumbnailBlobs ? [`image ${thumbnailBlobs[0].url}`] : []),
      ];

      if (uploadInfo.uploadedBlobs.length > 1) {
        for (const blob of uploadInfo.uploadedBlobs.slice(1)) {
          imetaTag.push(`fallback ${blob.url}`);
        }
      }
      if (uploadInfo.mirroredBlobs.length > 0) {
        for (const blob of uploadInfo.mirroredBlobs) {
          imetaTag.push(`mirror ${blob.url}`);
        }
      }

      const event = {
        kind,
        content: description,
        created_at: nowInSecs(),
        tags: [
          ["title", title],
          ["published_at", nowInSecs().toString()],
          ["duration", uploadInfo.duration?.toString() || "0"],
          imetaTag,
          ...tags.map((tag) => ["t", tag]),
          ["client", "nostube"],
        ],
      };

      publish({event, relays: ['wss://haven.slidestr.net']}, {
        onSuccess: (publishedEvent, vars) => {
          navigate(
            `/video/${nip19.neventEncode({
              kind: publishedEvent.kind,
              id: publishedEvent.id,
              author: publishedEvent.pubkey,
              relays: vars.relays
            })}`
          );
        },
      });
      console.log(event);

      // Reset form
      setTitle("");
      setDescription("");
      setFile(null);
      setThumbnail(null);
      setTags([]);
      setTagInput("");
    } catch (error) {
      console.error("Upload failed:", error);
    }
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setThumbnail(e.target.files?.[0] || null);
  };

  const handleThumbnailSourceChange = (value: string) => {
    setThumbnailSource(value as "generated" | "upload");
    if (value === "generated") {
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
      setUploadStarted(true);
      // Start upload automatically
      try {
        const uploadedBlobs = await uploadFileToMultipleServers({
          file: acceptedFiles[0],
          servers: blossomInitalUploadServers.map((server) => server.url),
          signer: async (draft) => await user.signer.signEvent(draft),
        });
        // Calculate video duration and dimensions
        const video = document.createElement("video");
        video.src = URL.createObjectURL(acceptedFiles[0]);
        await new Promise((resolve) => {
          video.onloadedmetadata = resolve;
        });
        const duration = Math.round(video.duration);
        const dimensions = `${video.videoWidth}x${video.videoHeight}`;
        const sizeMB = acceptedFiles[0].size / 1024 / 1024;

        // --- MP4Box.js: Extract codec info ---
        function getCodecsFromFile(
          file: File
        ): Promise<{ videoCodec?: string; audioCodec?: string }> {
          return new Promise((resolve, reject) => {
            const mp4boxfile = MP4Box.createFile();
            let videoCodec: string | undefined;
            let audioCodec: string | undefined;
            mp4boxfile.onError = (err: unknown) => reject(err);
            mp4boxfile.onReady = (info: Movie) => {
              for (const track of info.tracks) {
                if (track.type && track.type === "video" && track.codec)
                  videoCodec = track.codec;
                if (track.type && track.type === "audio" && track.codec)
                  audioCodec = track.codec;
              }
              resolve({ videoCodec, audioCodec });
            };
            const fileReader = new FileReader();
            fileReader.onload = () => {
              const arrayBuffer = fileReader.result as ArrayBuffer;
              const mp4boxBuffer = Object.assign(arrayBuffer, { fileStart: 0 });
              mp4boxfile.appendBuffer(mp4boxBuffer);
              mp4boxfile.flush();
            };
            fileReader.onerror = reject;
            fileReader.readAsArrayBuffer(file);
          });
        }

        let codecs: { videoCodec?: string; audioCodec?: string } = {};
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
            mirrorServers: blossomMirrorServers.map((s) => s.url),
            blob: uploadedBlobs[0], // TODO which blob to mirror?
            signer: async (draft) => await user.signer.signEvent(draft),
          });
          setUploadInfo((ui) => ({
            ...ui,
            mirroredBlobs,
          }));
        }
      } catch {
        setUploadStarted(false);
        setUploadInfo({ uploadedBlobs: [], mirroredBlobs: [] });
        // Optionally show error toast
      }
    }
    setUploadStarted(false);
  };
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "video/*": [] },
    multiple: false,
  });

  // Memoize the uploaded video URL for thumbnail generation
  const uploadedVideoUrl = useMemo(() => {
    return uploadInfo.uploadedBlobs && uploadInfo.uploadedBlobs.length > 0
      ? uploadInfo.uploadedBlobs[0].url
      : undefined;
  }, [uploadInfo.uploadedBlobs]);

  // Generate thumbnail from video after upload using a headless video element
  useEffect(() => {
    async function createThumbnailFromUrl(
      videoUrl: string,
      seekTime = 1
    ): Promise<Blob | null> {
      return new Promise<Blob | null>((resolve, reject) => {
        const video = document.createElement("video");
        video.src = videoUrl;
        video.crossOrigin = "anonymous";
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";

        video.addEventListener(
          "loadedmetadata",
          () => {
            // Clamp seekTime to video duration
            const time = Math.min(seekTime, video.duration - 0.1);
            video.currentTime = time > 0 ? time : 0;
          },
          { once: true }
        );

        video.addEventListener(
          "seeked",
          () => {
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d");
            ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.8);
          },
          { once: true }
        );

        video.addEventListener(
          "error",
          () => {
            reject(new Error("Failed to load video for thumbnail"));
          },
          { once: true }
        );
      });
    }

    if (uploadedVideoUrl) {
      setThumbnailBlob(null); // reset before generating new
      createThumbnailFromUrl(uploadedVideoUrl, 1)
        .then((blob) => {
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
  }, [uploadedVideoUrl]);

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
    setTitle("");
    setDescription("");
    setTags([]);
    setTagInput("");
    setFile(null);
    setThumbnail(null);
    setUploadInfo({ uploadedBlobs: [], mirroredBlobs: [] });
    setUploadStarted(false);
    setThumbnailBlob(null);
    setThumbnailSource("generated");
  };

  if (!user) {
    return <div>Please log in to upload videos</div>;
  }

  const formatBlobUrl = (url: string) => {
    return url
      .replace("https://", "")
      .replace("http://", "")
      .replace(/\/.*$/, "");
  };

  return (
    <Card>
      {/* Info bar above drop zone */}
      <div className="flex items-center justify-between bg-muted border border-muted-foreground/10 rounded px-4 py-2 mb-4">
        <div className="text-sm text-muted-foreground">
          Uploading directly to{" "}
          <b className="text-foreground">
            {blossomInitalUploadServers?.length ?? 0}
          </b>{" "}
          server{(blossomInitalUploadServers?.length ?? 0) === 1 ? "" : "s"}.
          Mirroring to{" "}
          <b className="text-foreground">{blossomMirrorServers?.length ?? 0}</b>{" "}
          server{(blossomMirrorServers?.length ?? 0) === 1 ? "" : "s"}.
        </div>
        <Button
          onClick={() => navigate("/settings")}
          variant={"outline"}
          className=" cursor-pointer"
        >
          Configure servers
        </Button>
      </div>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-4">
          {/* Dropzone or video preview + info */}
          {uploadInfo.uploadedBlobs && uploadInfo.uploadedBlobs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div className="w-full">
                <video
                  controls
                  className="w-full rounded-lg border shadow max-h-[320px]"
                  poster={undefined}
                  crossOrigin="anonymous"
                >
                  {/* Main video source */}
                  <source src={uploadInfo.uploadedBlobs[0]?.url} />
                  {/* Fallback sources if more than one blob exists */}
                  {uploadInfo.uploadedBlobs.slice(1).map((blob, idx) => (
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
                    <div className="text-muted-foreground">Size:</div>
                    <div>
                      <span className="font-mono">{uploadInfo.sizeMB} MB</span>
                    </div>
                    <div className="text-muted-foreground">Duration:</div>
                    <div>
                      <span className="font-mono">
                        {uploadInfo.duration} seconds
                      </span>
                    </div>
                    {uploadInfo.videoCodec && (
                      <>
                        <div className="text-muted-foreground">
                          Video Codec:
                        </div>
                        <div>
                          <span className="font-mono">
                            {uploadInfo.videoCodec}
                          </span>
                        </div>
                        {uploadInfo.videoCodec.startsWith("av01") && (
                          <div className="col-span-2 mt-2 text-sm text-yellow-700 bg-yellow-100 border border-yellow-300 rounded p-2">
                            <b>Warning:</b> AV1 videos (<code>av01</code>)
                            cannot be played on iOS or Safari browsers. Please
                            use H.264/AVC for maximum compatibility.
                          </div>
                        )}
                        {uploadInfo.videoCodec.startsWith("vp09") && (
                          <div className="col-span-2 mt-2 text-sm text-yellow-700 bg-yellow-100 border border-yellow-300 rounded p-2">
                            <b>Warning:</b> VP9 videos (<code>vp09</code>) are
                            not supported on iOS or Safari browsers. For maximum
                            compatibility, use H.264/AVC.
                          </div>
                        )}
                        {uploadInfo.videoCodec.startsWith("hvc1") && (
                          <div className="col-span-2 mt-2 text-sm text-blue-800 bg-blue-100 border border-blue-300 rounded p-2">
                            <b>Info:</b> H.265/HEVC (<code>hvc1</code>) is
                            widely supported. Only some de-googled Linux
                            browsers may have issues.
                          </div>
                        )}
                        {uploadInfo.videoCodec.startsWith("avc1") && (
                          <div className="col-span-2 mt-2 text-sm text-green-800 bg-green-100 border border-green-300 rounded p-2">
                            <b>Great:</b> H.264/AVC (<code>avc1</code>) is the
                            most widely supported video codec and will play on
                            all browsers and devices.
                          </div>
                        )}
                      </>
                    )}

                    {/*uploadInfo.audioCodec && (
                      <>
                        <div className="text-muted-foreground">Audio Codec:</div>
                        <div><span className="font-mono">{uploadInfo.audioCodec}</span></div>
                      </>
                    )*/}
                  </div>
                </div>
              </div>
            </div>
          ) : blossomInitalUploadServers &&
            blossomInitalUploadServers.length > 0 ? (
            <div
              className="mb-4"
              style={{
                display:
                  uploadInfo.uploadedBlobs &&
                  uploadInfo.uploadedBlobs.length > 0
                    ? "none"
                    : undefined,
              }}
            >
              <div
                {...getRootProps()}
                className={
                  `flex flex-col items-center h-32 justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors ` +
                  (isDragActive
                    ? "border-primary bg-muted"
                    : "border-gray-300 bg-background hover:bg-muted")
                }
              >
                <input {...getInputProps()} />
                <span className="text-base text-muted-foreground">
                  {isDragActive
                    ? "Drop the video here..."
                    : "Drag & drop a video file here, or click to select"}
                </span>
                {file && (
                  <div className="mt-2 text-sm text-foreground">
                    <b>Selected:</b> {file.name} (
                    {(file.size / 1024 / 1024).toFixed(2)} MB)
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground bg-yellow-50 border border-yellow-200 rounded p-3 mb-2">
              <span>
                You do not have any Blossom server tagged with{" "}
                <b>"initial upload"</b>.<br />
                Please go to{" "}
                <a href="/settings" className="underline text-blue-600">
                  Settings
                </a>{" "}
                and assign the <b>"initial upload"</b> tag to at least one
                server.
              </span>
            </div>
          )}

          {/* Uploading to... server list */}
          <div className="flex flex-col">
            {!blossomInitalUploadServers ||
            blossomInitalUploadServers.length === 0 ? (
              <div className="text-sm text-muted-foreground bg-yellow-50 border border-yellow-200 rounded p-3 mb-2">
                <span>
                  You do not have any Blossom server tagged with{" "}
                  <b>"initial upload"</b>.<br />
                  Please go to{" "}
                  <a href="/settings" className="underline text-blue-600">
                    Settings
                  </a>{" "}
                  and assign the <b>"initial upload"</b> tag to at least one
                  server.
                </span>
              </div>
            ) : (
              uploadInfo.uploadedBlobs &&
              uploadInfo.uploadedBlobs.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Label>Uploaded to...</Label>
                  <ul className="flex flex-col gap-1">
                    {(uploadInfo.uploadedBlobs ?? []).map((blob) => (
                      <li key={blob.url} className="flex items-center gap-2">
                        <Check className="w-5 h-5 text-green-500" />

                        <Badge variant="secondary">
                          {formatBlobUrl(blob.url)}
                        </Badge>
                        <a
                          href={blob.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open uploaded video URL"
                        >
                          <ExternalLink className="w-5 h-5" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            )}
            {uploadInfo.mirroredBlobs &&
              uploadInfo.mirroredBlobs.length > 0 && (
                <div className="flex flex-col gap-2 mt-4">
                  <Label>Mirrored to...</Label>
                  <ul className="flex flex-col gap-1">
                    {(uploadInfo.mirroredBlobs ?? []).map((blob) => (
                      <li key={blob.url} className="flex items-center gap-2">
                        <Check className="w-5 h-5 text-green-500" />
                        <Badge variant="secondary">
                          {formatBlobUrl(blob.url)}
                        </Badge>
                        <a
                          href={blob.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open mirrored video URL"
                        >
                          <ExternalLink className="w-5 h-5" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            {/* Infinite progress spinner while uploading */}
            {uploadStarted && (
              <div className="flex items-center gap-2 mt-4">
                <Loader2 className="animate-spin h-5 w-5 text-primary" />
                <span className="text-sm text-muted-foreground">
                  Uploading...
                </span>
              </div>
            )}
          </div>

          {/* Show form fields only after upload has started */}
          {uploadStarted && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="tags">Tags</Label>
                <Input
                  id="tags"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  onBlur={() => {
                    if (tagInput.trim()) {
                      if (!tags.includes(tagInput.trim())) {
                        setTags([...tags, tagInput.trim()]);
                      }
                      setTagInput("");
                    }
                  }}
                  placeholder="Press Enter to add tags"
                />
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="flex items-center gap-1"
                      >
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
                    <Label htmlFor="generated-thumb">
                      Use generated thumbnail
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="upload" id="upload-thumb" />
                    <Label htmlFor="upload-thumb">
                      Upload custom thumbnail
                    </Label>
                  </div>
                </RadioGroup>
                {thumbnailSource === "generated" && thumbnailBlob && (
                  <div className="mt-4">
                    <img
                      src={thumbnailUrl}
                      alt="Generated thumbnail"
                      className="rounded border mt-2 max-h-[320px]"
                    />
                  </div>
                )}
                {thumbnailSource === "upload" && (
                  <Input
                    id="thumbnail"
                    type="file"
                    accept="image/*"
                    onChange={handleThumbnailChange}
                    required
                  />
                )}
              </div>
            </>
          )}

        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleReset}
            title="Reset form"
            aria-label="Reset form"
          >
            <Trash className="w-5 h-5" />
          </Button>
          <Button
            type="submit"
            disabled={
              !uploadInfo.uploadedBlobs ||
              uploadInfo.uploadedBlobs.length === 0 ||
              !title ||
              !description ||
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
