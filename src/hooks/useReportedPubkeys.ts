import { useMemo } from "react";

import { useReports, type ProcessedReportEvent } from "./useReports";
import { nip19 } from "nostr-tools";

const blockPubkeys: Record<string, boolean> = [
  "npub18hgsruk953pkx5th2xdreureplkekuja7c8f9ffc9arsghwtfvqsuhsl9c"
].map(p => (nip19.decode(p).data as string)).reduce((prev, cur) => ({...prev, [cur]:true}), {});

export type ReportedPubkeys = Record<string, ProcessedReportEvent | boolean>;

export const useReportedPubkeys = (): ReportedPubkeys | undefined => {
  const { data: reports } = useReports({});

  const reportedPubkeys = useMemo(() => {
    if (!reports) {
      return blockPubkeys;
    }

    const illegalReports = reports
      .filter((report) => {
        if (!report.pubkey) {
          return false;
        }
        return (
          report.pubkeyReason === "illegal" || report.eventReason === "illegal"
        );
      })
      .reduce((acc: Record<string, ProcessedReportEvent>, report) => {
        if (report.pubkey && !acc[report.pubkey]) {
          acc[report.pubkey] = report;
        }
        return acc;
      }, {});

    return { ...blockPubkeys, ...illegalReports };
  }, [reports]);

  console.log(reportedPubkeys);
  return reportedPubkeys;
};
