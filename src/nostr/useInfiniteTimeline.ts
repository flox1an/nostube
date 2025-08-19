import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Subject } from "rxjs";
import { finalize, takeUntil, tap } from "rxjs/operators";
import { processEvents } from '@/utils/video-event';
import { useReportedPubkeys } from '@/hooks/useReportedPubkeys';
import { useAppContext } from '@/hooks/useAppContext';
import { mapEventsToStore } from "applesauce-core";
import { eventStore, storeEventInIDB } from './core';

// Minimales Event - muss mit der processEvents Funktion kompatibel sein
export type NEvent = {
  id: string;
  kind: number;
  pubkey: string;
  created_at: number;
  content: string;
  tags: string[][];
  sig: string; // Required by processEvents
};

// LoaderFn: applesauce-Loader, der ein Observable<NEvent> zurückgibt
type LoaderFn = () => import('rxjs').Observable<NEvent>;

export function useInfiniteTimeline(getLoader: LoaderFn) {
  const [events, setEvents] = useState<NEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const blockedPubkeys = useReportedPubkeys();
  const { config } = useAppContext();

  // Get read relays from user config
  const readRelays = useMemo(() => 
    config.relays.filter(r => r.tags.includes('read')).map(r => r.url),
    [config.relays]
  );

  // Abort-Signale pro „Page Load"
  const pageAbort$ = useRef(new Subject<void>());

  const loadMore = useCallback(() => {
    if (loading || exhausted) return;
    setLoading(true);

    // applesauce-Loader ist bereits ein Observable -> direkt RxJS-Operators
    const sub = getLoader()
      .pipe(
        takeUntil(pageAbort$.current), // cancel falls Komponente wechselt/unmountet
        mapEventsToStore(eventStore), // Events automatisch in EventStore speichern
        tap(async (event) => {
          // Manuell in IDB speichern für zusätzliche Persistenz
          try {
            await storeEventInIDB(event);
          } catch (error) {
            console.warn('Failed to store event in IDB:', error);
          }
        }),
        finalize(() => setLoading(false)) // egal ob complete/error
      )
      .subscribe({
        next: (e) => {
          setEvents(prev => (prev.some(x => x.id === e.id) ? prev : [...prev, e]));
        },
        complete: () => {
          // Simple Heuristik: nichts Neues? -> eventuell „am Ende"
          setExhausted(prev => prev || false /* hier ggf. besseres Signal vom Loader nutzen */);
        },
        error: (_err) => {
          // Fehler beendet diesen Page-Load, aber wir lassen die Liste stehen
        }
      });

    return () => sub.unsubscribe();
  }, [loading, exhausted, getLoader]);

  // Reset (z. B. beim Filterwechsel)
  const reset = useCallback(() => {
    pageAbort$.current.next(); // laufende Page-Loads abbrechen
    setEvents([]);
    setExhausted(false);
    setLoading(false);
  }, []);

  // Bei Unmount alle laufenden Loads abbrechen
  useEffect(() => {
    return () => {
      pageAbort$.current.next();
      pageAbort$.current.complete();
    };
  }, []);

  // Process events to VideoEvent format
  const videos = useMemo(() => {
    return processEvents(events, readRelays, blockedPubkeys);
  }, [events, readRelays, blockedPubkeys]);

  return { 
    events, 
    videos, 
    loading, 
    exhausted, 
    loadMore, 
    reset 
  };
}
