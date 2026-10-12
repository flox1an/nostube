const pad = (n: number) => String(n).padStart(2, '0')

/** Unix seconds as the value of an `<input type="datetime-local">` (the creator's local time). */
export function toLocalInput(seconds: number): string {
  const d = new Date(seconds * 1000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** The inverse; `undefined` for an empty field, NaN for a broken one. */
export function fromLocalInput(text: string): number | undefined {
  return text ? Math.floor(new Date(text).getTime() / 1000) : undefined
}

export const isFuture = (seconds: number | undefined) =>
  seconds === undefined || seconds > Math.floor(Date.now() / 1000)
