import { useMemo } from 'react'

import { useReports, type ProcessedReportEvent } from './useReports'
import { useSelectedPreset } from './useSelectedPreset'
import { useMutedPubkeys } from './useMutedPubkeys'

export type ReportedPubkeys = Record<string, ProcessedReportEvent | boolean>

/**
 * Accounts the app blocks outright: blocked by the active preset, or reported
 * as illegal. Their profile and video pages are gated entirely, so this must
 * NOT include the user's own mutes — muting hides content from feeds, it does
 * not lock the user out of a page they deliberately navigated to.
 */
export const useBlockedPubkeys = (): ReportedPubkeys => {
  const { data: reports } = useReports({})
  const { presetContent } = useSelectedPreset()

  return useMemo(() => {
    // Convert preset's blocked pubkeys to Record format
    const presetBlockedPubkeys: Record<string, boolean> = presetContent.blockedPubkeys.reduce(
      (acc, pubkey) => ({ ...acc, [pubkey]: true }),
      {}
    )

    if (!reports) return presetBlockedPubkeys

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
}

/**
 * Every account whose content should stay out of feeds, suggestions and
 * comment threads: the blocked accounts plus the ones this user muted.
 */
export const useReportedPubkeys = (): ReportedPubkeys | undefined => {
  const blockedPubkeys = useBlockedPubkeys()
  const { mutedPubkeys } = useMutedPubkeys()

  return useMemo(() => {
    if (mutedPubkeys.length === 0) return blockedPubkeys

    const mutedPubkeysRecord: Record<string, boolean> = mutedPubkeys.reduce(
      (acc, pubkey) => ({ ...acc, [pubkey]: true }),
      {} as Record<string, boolean>
    )

    return { ...blockedPubkeys, ...mutedPubkeysRecord }
  }, [blockedPubkeys, mutedPubkeys])
}
