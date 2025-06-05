import { useState } from 'react';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

export function VideoUpload() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  
  const { user } = useCurrentUser();
  const { mutateAsync: uploadFile } = useUploadFile();
  const { mutate: publish } = useNostrPublish();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !thumbnail || !user) return;

    try {
      // Upload video and thumbnail to Blossom
      const [[, videoUrl]] = await uploadFile(file);
      const [[, thumbUrl]] = await uploadFile(thumbnail);

      // Calculate video duration and dimensions
      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      await new Promise((resolve) => {
        video.onloadedmetadata = resolve;
      });
      const duration = Math.round(video.duration);
      const dimensions = `${video.videoWidth}x${video.videoHeight}`;

      // Generate unique identifier
      const videoId = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;

      // Publish Nostr event (NIP-71)
      publish({
        kind: 34235,
        content: description,
        tags: [
          ['d', videoId],
          ['title', title],
          ['description', description],
          ['url', videoUrl],
          ['m', file.type],
          ['thumb', thumbUrl],
          ['duration', duration.toString()],
          ['dim', dimensions],
          ['size', file.size.toString()],
          ...tags.map(tag => ['t', tag]),
          ['client', 'nostr-tube']
        ]
      });

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
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={!file || !thumbnail}>
            Upload Video
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}