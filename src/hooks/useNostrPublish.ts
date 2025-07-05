import { useNostr } from "@nostrify/react";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { useCurrentUser } from "./useCurrentUser";

import type { NostrEvent } from "@nostrify/nostrify";
import { nowInSecs } from "@/lib/utils";

type PublishArgs = {
  event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>;
  relays?: string[];
}

export function useNostrPublish(): UseMutationResult<NostrEvent, Error, PublishArgs> {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useMutation({
    mutationFn: async (t: PublishArgs) => {
      if (user) {
        const tags = t.event.tags ?? [];

        // Add the client tag if it doesn't exist
        if (!tags.some((tag) => tag[0] === "client")) {
          tags.push(["client", "nostube"]);
        }

        const event = await user.signer.signEvent({
          kind: t.event.kind,
          content: t.event.content ?? "",
          tags,
          created_at: t.event.created_at ?? nowInSecs(),
        });

        await nostr.event(event, { signal: AbortSignal.timeout(5000), relays: t.relays });
        return event;
      } else {
        throw new Error("User is not logged in");
      }
    },
    onError: (error) => {
      console.error("Failed to publish event:", error);
    },
    onSuccess: (data) => {
      console.log("Event published successfully:", data);
    },
  });
}