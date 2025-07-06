import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useAuthor } from '@/hooks/useAuthor';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useState } from 'react';
import { formatDistance } from 'date-fns';
import { useAppContext } from '@/hooks/useAppContext';
import { NostrEvent } from 'nostr-tools';
import { nowInSecs } from '@/lib/utils';

interface Comment {
  id: string;
  content: string;
  pubkey: string;
  created_at: number;
}

interface VideoCommentsProps {
  videoId: string;
  authorPubkey: string;
}

function mapEventToComment(event: NostrEvent): Comment {
  return {
    id: event.id,
    content: event.content,
    pubkey: event.pubkey,
    created_at: event.created_at,
  };
}

function CommentItem({ comment }: { comment: Comment }) {
  const author = useAuthor(comment.pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.name || comment.pubkey.slice(0, 8);

  return (
    <div className="flex gap-4 mb-6">
      <Avatar>
        <AvatarImage src={metadata?.picture} />
        <AvatarFallback>{name[0]}</AvatarFallback>
      </Avatar>
      <div>
        <div className="flex items-center gap-2">
          <div className="font-semibold">{name}</div>
          <div className="text-sm text-muted-foreground">
            {formatDistance(new Date(comment.created_at * 1000), new Date(), {
              addSuffix: true,
            })}
          </div>
        </div>
        <div className="mt-1">{comment.content}</div>
      </div>
    </div>
  );
}

export function VideoComments({ videoId, authorPubkey }: VideoCommentsProps) {
  const [newComment, setNewComment] = useState('');
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutate: publish } = useNostrPublish();
  const { config } = useAppContext();

  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: ['video-comments', videoId],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [
          {
            kinds: [1],
            '#e': [videoId],
            limit: 100,
          },
          {
            kinds: [1111],
            '#E': [videoId],
            limit: 100,
          },
        ],
        { signal, relays: config.relays }
      );
      return events.sort((a, b) => b.created_at - a.created_at).map(mapEventToComment);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim()) return;

    const draftEvent = {
      kind: 1111,
      content: newComment,
      created_at: nowInSecs(),
      tags: [
        ['E', videoId],
        ['P', authorPubkey],
        ['e', videoId],
        ['p', authorPubkey],
        ['client', 'nostube'],
      ],
    };
    publish({ event: draftEvent });

    setNewComment('');
  };

  return (
    <>
      <h2 className="mb-4">Comments</h2>
      {user && (
        <form onSubmit={handleSubmit} className="mb-8">
          <Textarea
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="mb-2"
          />
          <Button type="submit" disabled={!newComment.trim()}>
            Comment
          </Button>
        </form>
      )}

      <div>
        {comments.map(comment => (
          <CommentItem key={comment.id} comment={comment} />
        ))}
      </div>
    </>
  );
}
