import { useQuery } from '@tanstack/react-query';

import { useNostr } from '@/hooks/useNostr';
import type { NostrFilter } from '@nostrify/nostrify';

export interface ProcessedReportEvent {
  justification: string;
  pubkey?: string;
  pubkeyReason?: string;
  eventId?: string;
  eventReason?: string;
  hash?: string;
  hashReason?: string;
}

interface UseReportsParams {
  p?: string; // pubkey
  e?: string; // eventId
  x?: string; // blob hash
}

export const useReports = ({ p, e, x }: UseReportsParams = {}) => {
  const { nostr } = useNostr();

  return useQuery<ProcessedReportEvent[]>({
    queryKey: ['reports', p, e, x],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(3000)]);

      const filter: NostrFilter = {
        kinds: [1984],
      };

      if (p) {
        filter['#p'] = [p];
      }
      if (e) {
        filter['#e'] = [e];
      }
      if (x) {
        filter['#x'] = [x];
      }

      const events = await nostr.query([filter], { signal });

      return events.map((event) => {
        const processed: ProcessedReportEvent = {
          justification: event.content,
        };

        const pTag = event.tags.find(tag => tag[0] === 'p' && tag[1]);
        if (pTag) {
          processed.pubkey = pTag[1];
          processed.pubkeyReason = pTag[2];
        }

        const eTag = event.tags.find(tag => tag[0] === 'e' && tag[1]);
        if (eTag) {
          processed.eventId = eTag[1];
          processed.eventReason = eTag[2];
        }

        const xTag = event.tags.find(tag => tag[0] === 'x' && tag[1]);
        if (xTag) {
          processed.hash = xTag[1];
          processed.hashReason = xTag[2];
        }

        return processed;
      });
    },
    staleTime: Infinity,
  });
}; 