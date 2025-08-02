import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventModel } from 'applesauce-react/hooks';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { ReactionsModel } from 'applesauce-core/models';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HeartIcon } from 'lucide-react';
import { cn, nowInSecs } from '@/lib/utils';
import { NostrEvent } from 'nostr-tools';

interface ButtonWithReactionsProps {
  eventId: string;
  kind: number;
  authorPubkey: string;
  className?: string;
}

export function ButtonWithReactions({ eventId, kind, authorPubkey, className }: ButtonWithReactionsProps) {
  const { user } = useCurrentUser();
  const { mutate: publish } = useNostrPublish();

  // Create a dummy event object for ReactionsModel
  // ReactionsModel expects a NostrEvent, so we create a minimal one
  const dummyEvent: NostrEvent = {
    id: eventId,
    pubkey: authorPubkey,
    created_at: 0,
    kind: kind,
    tags: [],
    content: '',
    sig: '',
  };

  // Use ReactionsModel to get reactions for this event
  const reactions = useEventModel(ReactionsModel, [dummyEvent]) || [];

  // Check if current user has liked
  const hasLiked = user && reactions.some(event => event.pubkey === user.pubkey && event.content === '+');

  // Count likes
  const likeCount = reactions.filter(event => event.content === '+').length;

  const handleLike = () => {
    if (!user) return;

    // If already liked, we'll unlike by doing nothing (as reactions are ephemeral)
    if (!hasLiked) {
      publish({
        event: {
          kind: 7,
          created_at: nowInSecs(),
          content: '+',
          tags: [
            ['e', eventId],
            ['p', authorPubkey],
            ['k', `${kind}`],
          ],
        },
      });
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className={cn('space-x-2', className)}
          onClick={handleLike}
          disabled={!user}
        >
          <HeartIcon className={cn('h-5 w-5', hasLiked ? 'fill-red-500 stroke-red-500' : 'fill-none')} />
          <span>{likeCount}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{user ? (hasLiked ? 'Unlike' : 'Like') : 'Login to like'}</TooltipContent>
    </Tooltip>
  );
}
