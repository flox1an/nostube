export interface ChatAppearance {
  fontSize: number
  coloredNames: boolean
  timestamps: boolean
  hideMuted: boolean
  showTrust: boolean
  /** Minimum personal trust score (0 = off); senders with a lower known score are hidden. */
  minTrust: number
}

export const DEFAULT_CHAT_APPEARANCE: ChatAppearance = {
  fontSize: 14,
  coloredNames: true,
  timestamps: false,
  hideMuted: true,
  showTrust: true,
  minTrust: 0,
}

/** Phones: larger text, no trust badges to save width. */
export const MOBILE_CHAT_APPEARANCE: ChatAppearance = {
  ...DEFAULT_CHAT_APPEARANCE,
  fontSize: 16,
  showTrust: false,
}

/** Stored settings over `defaults`; invalid or missing fields fall back to the default. */
export function normalizeChatAppearance(
  value: unknown,
  defaults: ChatAppearance = DEFAULT_CHAT_APPEARANCE
): ChatAppearance {
  const stored = value && typeof value === 'object' ? value : {}
  const bool = (key: keyof ChatAppearance) =>
    key in stored && typeof stored[key as keyof typeof stored] === 'boolean'
      ? (stored[key as keyof typeof stored] as boolean)
      : (defaults[key] as boolean)
  return {
    fontSize:
      'fontSize' in stored && [12, 14, 16, 18].includes(Number(stored.fontSize))
        ? Number(stored.fontSize)
        : defaults.fontSize,
    coloredNames: bool('coloredNames'),
    timestamps: bool('timestamps'),
    hideMuted: bool('hideMuted'),
    showTrust: bool('showTrust'),
    minTrust:
      'minTrust' in stored && [0, 0.2, 0.4, 0.7].includes(Number(stored.minTrust))
        ? Number(stored.minTrust)
        : defaults.minTrust,
  }
}
