import { useMemo } from 'react'

import { useReports, type ProcessedReportEvent } from './useReports'
import { nip19 } from 'nostr-tools'

const blockPubkeys: Record<string, boolean> = [
  'npub137sg0m8qw0e558ezzhx6vwuva4pv5nzgae7qdkq3m06wy4ndll8srjyzhq', // NSFW
  'npub18hgsruk953pkx5th2xdreureplkekuja7c8f9ffc9arsghwtfvqsuhsl9c',
  'npub19q6xeyj5ve7572k84vgr2rchth00tl7t0j530k67jh36q5vjn02qaw3cpz',
  'npub1rk27vy78zk8kszeyauu560xadd3vzh5dltgg0wd2vpsjujyvquws4rzulu',
  'npub1ulafm4d3n7ukl7yzg4hfnhfjut74nym5p83e3d67l3j62yc6ysqqrancw2',
  'npub1yzey60g2ge3jr9nwr2ktrk0ngllp38hs635m48f72f7mal0dd7ss6wercd',
  'npub16w7wnp0jn447ysdaclq9d8n5k8p5ekcqw09z9jd3necyvrej7jeqf983wv',
]
  .map(p => nip19.decode(p).data as string)
  .reduce((prev, cur) => ({ ...prev, [cur]: true }), {})

export type ReportedPubkeys = Record<string, ProcessedReportEvent | boolean>

export const useReportedPubkeys = (): ReportedPubkeys | undefined => {
  const { data: reports } = useReports({})

  const reportedPubkeys = useMemo(() => {
    if (!reports) {
      return blockPubkeys
    }

    const illegalReports = reports
      .filter(report => {
        if (!report.pubkey) {
          return false
        }
        return report.pubkeyReason === 'illegal' || report.eventReason === 'illegal'
      })
      .reduce((acc: Record<string, ProcessedReportEvent>, report) => {
        if (report.pubkey && !acc[report.pubkey]) {
          acc[report.pubkey] = report
        }
        return acc
      }, {})

    return { ...blockPubkeys, ...illegalReports }
  }, [reports])

  return reportedPubkeys
}
