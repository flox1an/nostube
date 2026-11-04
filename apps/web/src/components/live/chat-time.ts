export function formatChatTime(seconds: number, locales?: Intl.LocalesArgument): string {
  return new Intl.DateTimeFormat(locales, { hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(seconds * 1000))
    .filter(part => part.type !== 'dayPeriod')
    .map(part => part.value)
    .join('')
    .trim()
}
