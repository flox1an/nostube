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

export function normalizeChatAppearance(value: unknown): ChatAppearance {
  const stored = value && typeof value === 'object' ? value : {}
  return {
    fontSize:
      'fontSize' in stored && [12, 14, 16, 18].includes(Number(stored.fontSize))
        ? Number(stored.fontSize)
        : 14,
    coloredNames:
      'coloredNames' in stored && typeof stored.coloredNames === 'boolean'
        ? stored.coloredNames
        : true,
    timestamps: 'timestamps' in stored && stored.timestamps === true,
    hideMuted: !('hideMuted' in stored && stored.hideMuted === false),
    showTrust: !('showTrust' in stored && stored.showTrust === false),
    minTrust:
      'minTrust' in stored && [0, 0.2, 0.4, 0.7].includes(Number(stored.minTrust))
        ? Number(stored.minTrust)
        : 0,
  }
}
