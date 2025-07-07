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
import { Link } from 'react-router-dom';

interface Comment {
  id: string;
  content: string;
  pubkey: string;
  created_at: number;
}

interface VideoCommentsProps {
  videoId: string;
  authorPubkey: string;
  link: string;
}

function mapEventToComment(event: NostrEvent): Comment {
  return {
    id: event.id,
    content: event.content,
    pubkey: event.pubkey,
    created_at: event.created_at,
  };
}

function renderCommentContent(content: string, link: string) {
  // Regex to match mm:ss timestamps (optionally h:mm:ss)
  const timestampRegex = /\b(?:(\d+):)?(\d{1,2}):(\d{2})\b/g;
  const baseUrl = `/video/${link}`;
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = timestampRegex.exec(content)) !== null) {
    const [full, h, m, s] = match;
    const start = match.index;
    const end = start + full.length;
    // Push preceding text
    if (start > lastIndex) {
      parts.push(content.slice(lastIndex, start));
    }
    // Calculate seconds
    const hours = h ? parseInt(h, 10) : 0;
    const minutes = parseInt(m, 10);
    const seconds = parseInt(s, 10);
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    // Push link
    parts.push(
      <Link
        key={`ts-${start}`}
        to={`${baseUrl}?t=${totalSeconds}`}
        className="text-primary hover:text-primary/80 cursor-pointer"
      >
        {full}
      </Link>
    );
    lastIndex = end;
  }
  // Push any remaining text
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }
  return parts;
}

function CommentItem({ comment, link }: { comment: Comment; link: string }) {
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
        <div className="mt-1">{renderCommentContent(comment.content, link)}</div>
      </div>
    </div>
  );
}

export function VideoComments({ videoId, link, authorPubkey }: VideoCommentsProps) {
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
          <CommentItem key={comment.id} comment={comment} link={link} />
        ))}
      </div>
    </>
  );
}
