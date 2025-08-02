import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { Label } from '@/components/ui/label';

interface CreatePlaylistDialogProps {
  onClose: () => void;
  onCreatePlaylist: (name: string, description?: string) => Promise<void>;
}

export function CreatePlaylistDialog({ onClose, onCreatePlaylist }: CreatePlaylistDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({
        title: 'Error',
        description: 'Playlist name cannot be empty.',
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);
    try {
      await onCreatePlaylist(name, description);

      toast({
        title: 'Playlist created',
        description: 'Your new playlist has been created successfully.',
      });
      setName('');
      setDescription('');
      // Cache invalidation is handled automatically by applesauce EventStore
      onClose();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create playlist.',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Playlist
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Playlist</DialogTitle>
          <DialogDescription>Enter a name and optional description for your new playlist.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || isCreating}>
              {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create Playlist
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
