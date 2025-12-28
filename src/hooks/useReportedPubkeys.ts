import { useMemo } from 'react'

import { useReports, type ProcessedReportEvent } from './useReports'
import { useSelectedPreset } from './useSelectedPreset'

export type ReportedPubkeys = Record<string, ProcessedReportEvent | boolean>

export const useReportedPubkeys = (): ReportedPubkeys | undefined => {
  const { data: reports } = useReports({})
  const { presetContent } = useSelectedPreset()

  const reportedPubkeys = useMemo(() => {
    // Convert preset's blocked pubkeys to Record format
    const presetBlockedPubkeys: Record<string, boolean> = presetContent.blockedPubkeys.reduce(
      (acc, pubkey) => ({ ...acc, [pubkey]: true }),
      {}
    )

    if (!reports) {
      return presetBlockedPubkeys
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

    return { ...presetBlockedPubkeys, ...illegalReports }
  }, [reports, presetContent.blockedPubkeys])

  return reportedPubkeys
}
