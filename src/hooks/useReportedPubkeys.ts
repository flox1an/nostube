import { useMemo } from 'react'

import { useReports, type ProcessedReportEvent } from './useReports'
import { useSelectedPreset } from './useSelectedPreset'
import { useMutedPubkeys } from './useMutedPubkeys'

export type ReportedPubkeys = Record<string, ProcessedReportEvent | boolean>

export const useReportedPubkeys = (): ReportedPubkeys | undefined => {
  const { data: reports } = useReports({})
  const { presetContent } = useSelectedPreset()
  const { mutedPubkeys } = useMutedPubkeys()

  const reportedPubkeys = useMemo(() => {
    // Convert preset's blocked pubkeys to Record format
    const presetBlockedPubkeys: Record<string, boolean> = presetContent.blockedPubkeys.reduce(
      (acc, pubkey) => ({ ...acc, [pubkey]: true }),
      {}
    )

    // Convert muted pubkeys to Record format
    const mutedPubkeysRecord: Record<string, boolean> = mutedPubkeys.reduce(
      (acc, pubkey) => ({ ...acc, [pubkey]: true }),
      {} as Record<string, boolean>
    )

    if (!reports) {
      return { ...presetBlockedPubkeys, ...mutedPubkeysRecord }
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

    return { ...presetBlockedPubkeys, ...mutedPubkeysRecord, ...illegalReports }
  }, [reports, presetContent.blockedPubkeys, mutedPubkeys])

  return reportedPubkeys
}
