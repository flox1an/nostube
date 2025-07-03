import { useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X, Loader2 } from "lucide-react";
import { useAppContext } from "@/hooks/useAppContext";
import { Progress } from "@/components/ui/progress";
import { uploadFileToMultipleServers } from "@/lib/blossom-upload";
import { useDropzone } from "react-dropzone";

export function VideoUpload() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploadInfo, setUploadInfo] = useState<{
    dimension?: string;
    sizeMB?: number;
    duration?: number;
    videoUrls?: string[];
  }>({});
  const [uploadStarted, setUploadStarted] = useState(false);

  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const blossomServers = config.blossomServers?.filter((server) =>
    server.tags.includes("initial upload")
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !thumbnail || !user || !blossomServers) return;

    if (!file || !(file instanceof File))
      throw new Error("No valid video file selected");
    if (!thumbnail || !(thumbnail instanceof File))
      throw new Error("No valid thumbnail file selected");

    try {

      const [width, height] = uploadInfo.dimension?.split('x').map(Number) || [0, 0];
      const kind = height > width ? 22 : 21;

      const thumbUrl = await uploadFileToMultipleServers({
        file: thumbnail,
        servers: blossomServers.map((server) => server.url),
        signer: async (draft) => await user.signer.signEvent(draft),
      });

      // Publish Nostr event (NIP-71)
      const imetaTag = [
        "imeta",
        `dim ${uploadInfo.dimension}`,
        `url ${uploadInfo.videoUrls?.[0]}`,
        `m ${file.type}`,
        ...(thumbUrl ? [`image ${thumbUrl}`] : []),
        //"fallback https://backup.com/1080/12345.mp4", // other servers?
      ];

      const event = {
        kind, 
        content: description,
        tags: [
          ["title", title],
          ["published_at", Math.floor(Date.now() / 1000).toString()],
          ["duration", uploadInfo.duration?.toString() || "0"],
          imetaTag,
          ...tags.map((tag) => ["t", tag]),
          ["client", "nostube"],
        ],
      };

      console.log(event);


      // Reset form
      setTitle("");
      setDescription("");
      setFile(null);
      setThumbnail(null);
      setTags([]);
      setTagInput("");
      setProgress(0);
    } catch (error) {
      setProgress(0);
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

  // Dropzone for video file
  const onDrop = async (acceptedFiles: File[]) => {
    if (
      acceptedFiles &&
      acceptedFiles[0] &&
      blossomServers &&
      blossomServers.length > 0 &&
      user
    ) {
      setFile(acceptedFiles[0]);
      setUploadInfo({});
      setUploadStarted(true);
      setProgress(1); // show spinner immediately
      // Start upload automatically
      try {
        const videoUrls = await uploadFileToMultipleServers({
          file: acceptedFiles[0],
          servers: blossomServers.map((server) => server.url),
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
        setUploadInfo({
          dimension: dimensions,
          sizeMB: Number(sizeMB.toFixed(2)),
          duration,
          videoUrls,
        });
        setProgress(100);
      } catch {
        setProgress(0);
        setUploadStarted(false);
        setUploadInfo({});
        // Optionally show error toast
      }
    }
  };
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "video/*": [] },
    multiple: false,
  });

  if (!user) {
    return <div>Please log in to upload videos</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Video</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {/* Dropzone at the top */}
          <div className="mb-4">
            <div
              {...getRootProps()}
              className={
                `flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors ` +
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

          {/* Uploading to... server list */}
          <div className="space-y-2">
            <Label>Uploading to...</Label>
            {!blossomServers || blossomServers.length === 0 ? (
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
              <ul className="flex flex-col gap-1">
                {blossomServers.map((server) => (
                  <li key={server.url} className="flex items-center gap-2">
                    <Badge variant="secondary">{server.url}</Badge>
                  </li>
                ))}
              </ul>
            )}
            {/* Infinite progress spinner while uploading */}
            {progress > 0 && progress < 100 && (
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
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags</Label>
                <Input
                  id="tags"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
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
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="thumbnail">Thumbnail</Label>
            <Input
              id="thumbnail"
              type="file"
              accept="image/*"
              onChange={handleThumbnailChange}
              required
            />
          </div>

          {progress > 0 && progress < 100 && (
            <div className="my-4">
              <Progress value={progress} max={100} />
              <div className="text-xs text-muted-foreground mt-1">
                {progress}%
              </div>
            </div>
          )}

          {/* Upload info after upload */}
          {uploadInfo.dimension && uploadInfo.sizeMB && uploadInfo.duration && (
            <div className="mt-4 p-3 bg-muted rounded border text-sm">
              <div><b>Video Info:</b></div>
              <div>Dimension: <span className="font-mono">{uploadInfo.dimension}</span></div>
              <div>Size: <span className="font-mono">{uploadInfo.sizeMB} MB</span></div>
              <div>Duration: <span className="font-mono">{uploadInfo.duration} seconds</span></div>
              {uploadInfo.videoUrls && uploadInfo.videoUrls.length > 0 && (
                <div className="mt-2">
                  <div className="font-semibold">Uploaded URLs:</div>
                  <ul className="list-disc list-inside">
                    {uploadInfo.videoUrls.map((url: string) => (
                      <li key={url}>
                        <a href={url} target="_blank" rel="noopener noreferrer" className="underline text-blue-600 break-all">{url}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button type="submit">Upload</Button>
        </CardFooter>
      </form>
    </Card>
  );
}
