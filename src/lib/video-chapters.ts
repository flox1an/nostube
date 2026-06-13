export type VideoChapter = {
  startTime: number
  title: string
}

const CHAPTER_LINE_REGEX =
  /^\s*(?:(?<hours>\d{1,2}):)?(?<minutes>\d{1,2}):(?<seconds>\d{2})(?:[ \t]*[-–—|:][ \t]*|\s+)(?<title>\S.*)$/

function parseTimestamp(hours: string | undefined, minutes: string, seconds: string): number | null {
  const hourValue = hours ? Number(hours) : 0
  const minuteValue = Number(minutes)
  const secondValue = Number(seconds)

  if (
    !Number.isInteger(hourValue) ||
    !Number.isInteger(minuteValue) ||
    !Number.isInteger(secondValue) ||
    minuteValue > 59 ||
    secondValue > 59
  ) {
    return null
  }

  return hourValue * 3600 + minuteValue * 60 + secondValue
}

export function parseVideoChapters(description: string, duration?: number): VideoChapter[] {
  const chapters = new Map<number, string>()

  for (const line of description.split(/\r?\n/)) {
    const match = line.match(CHAPTER_LINE_REGEX)
    if (!match?.groups) continue

    const startTime = parseTimestamp(match.groups.hours, match.groups.minutes, match.groups.seconds)
    const title = match.groups.title.trim()

    if (startTime === null || title.length === 0) continue
    if (duration !== undefined && duration > 0 && startTime >= duration) continue
    if (!chapters.has(startTime)) chapters.set(startTime, title)
  }

  return [...chapters.entries()]
    .sort(([a], [b]) => a - b)
    .map(([startTime, title]) => ({ startTime, title }))
}
