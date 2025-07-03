import { useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { useUserBlossomServers } from '@/hooks/useUserBlossomServers';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from './ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { uploadFileWithProgress } from '@/lib/blossom-upload';

export function VideoUpload() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [selectedServers, setSelectedServers] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  
  const { user } = useCurrentUser();
  const { mutate: publish } = useNostrPublish();
  const { data: blossomServers = [] } = useUserBlossomServers();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !thumbnail || !user) return;

    try {
      // Set progress to 0 at the start
      // Upload video and thumbnail to Blossom (TODO: use selectedServers)
      const [[, videoUrl]] = await uploadFileWithProgress({
        file,
        server: selectedServers[0] || blossomServers[0],
        signer: user.signer.signEvent,
        onProgress: setProgress,
      });
      const [[, thumbUrl]] = await uploadFileWithProgress({
        file: thumbnail,
        server: selectedServers[0] || blossomServers[0],
        signer: user.signer.signEvent,
        onProgress: setProgress,
      });

      // Calculate video duration and dimensions
      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      await new Promise((resolve) => {
        video.onloadedmetadata = resolve;
      });
      const duration = Math.round(video.duration);
      const dimensions = `${video.videoWidth}x${video.videoHeight}`;

      const [width, height] = dimensions.split('x').map(Number);
      const kind = height > width ? 22 : 21;

      // Publish Nostr event (NIP-71)
      const imetaTag = [
        "imeta",
        `dim ${dimensions}`,
        `url ${videoUrl}`,
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
          ["duration", duration.toString()],
          imetaTag,
          ...tags.map(tag => ["t", tag]),
          ["client", "nostube"]
        ]
      };

      console.log(event);

      // Reset form
      setTitle('');
      setDescription('');
      setFile(null);
      setThumbnail(null);
      setTags([]);
      setTagInput('');
      setSelectedServers([]);
      setProgress(0);
    } catch (error) {
      setProgress(0);
      console.error('Upload failed:', error);
    }
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const toggleServer = (server: string) => {
    setSelectedServers((prev) =>
      prev.includes(server)
        ? prev.filter((s) => s !== server)
        : [...prev, server]
    );
  };

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

          <div className="space-y-2">
            <Label htmlFor="video">Video File</Label>
            <Input
              id="video"
              type="file"
              accept="video/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="thumbnail">Thumbnail</Label>
            <Input
              id="thumbnail"
              type="file"
              accept="image/*"
              onChange={(e) => setThumbnail(e.target.files?.[0] || null)}
              required
            />
          </div>

          {/* Blossom server multi-select dropdown menu */}
          <div className="space-y-2">
            <Label>Blossom Servers</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  {selectedServers.length > 0
                    ? `${selectedServers.length} selected`
                    : "Select servers"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[200px]">
                {blossomServers.map((server) => (
                  <DropdownMenuItem key={server} onClick={() => toggleServer(server)}>
                    <Checkbox
                      checked={selectedServers.includes(server)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          toggleServer(server);
                        }
                      }}
                    />
                    <span>{server}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {progress > 0 && progress < 100 && (
            <div className="my-4">
              <Progress value={progress} max={100} />
              <div className="text-xs text-muted-foreground mt-1">{progress}%</div>
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