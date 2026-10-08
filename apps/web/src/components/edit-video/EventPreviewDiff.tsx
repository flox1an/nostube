import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'

interface EventPreviewDiffProps {
  originalTags: string[][]
  newTags: string[][]
  originalKind: number
  newKind: number
  newContent: string
}

type DiffLine = {
  type: 'unchanged' | 'added' | 'removed' | 'changed'
  key: string
  originalValue?: string
  newValue?: string
  tag: string[]
}

/**
 * Serialize a tag for display: ["imeta", "dim 1920x1080", ...] → compact single line
 */
function serializeTag(tag: string[]): string {
  if (tag[0] === 'imeta') {
    // For imeta tags, show each field on its own for readability
    return `["imeta",\n${tag
      .slice(1)
      .map(v => `    "${v}"`)
      .join(',\n')}\n  ]`
  }
  return JSON.stringify(tag)
}

/**
 * Group tags by key for diffing. Multi-value keys (t, imeta, etc.) get indexed.
 */
function indexTags(tags: string[][]): Map<string, { tag: string[]; serial: string }> {
  const map = new Map<string, { tag: string[]; serial: string }>()
  const counters = new Map<string, number>()

  for (const tag of tags) {
    const key = tag[0]
    const count = counters.get(key) || 0
    counters.set(key, count + 1)
    const indexedKey = `${key}#${count}`
    map.set(indexedKey, { tag, serial: serializeTag(tag) })
  }
  return map
}

/**
 * Compute a tag-level diff between original and new tags.
 */
function computeDiff(originalTags: string[][], newTags: string[][]): DiffLine[] {
  const lines: DiffLine[] = []

  const origIndex = indexTags(originalTags)
  const newIndex = indexTags(newTags)

  // Collect all unique indexed keys in order (new tags order, then removed)
  const allKeys = new Set<string>()

  // First, add keys in new order
  const newCounters = new Map<string, number>()
  for (const tag of newTags) {
    const key = tag[0]
    const count = newCounters.get(key) || 0
    newCounters.set(key, count + 1)
    allKeys.add(`${key}#${count}`)
  }

  // Then add any keys only in original
  for (const k of origIndex.keys()) {
    allKeys.add(k)
  }

  for (const key of allKeys) {
    const orig = origIndex.get(key)
    const next = newIndex.get(key)

    if (orig && next) {
      if (orig.serial === next.serial) {
        lines.push({ type: 'unchanged', key, tag: next.tag })
      } else {
        lines.push({
          type: 'changed',
          key,
          originalValue: orig.serial,
          newValue: next.serial,
          tag: next.tag,
        })
      }
    } else if (orig && !next) {
      lines.push({ type: 'removed', key, originalValue: orig.serial, tag: orig.tag })
    } else if (!orig && next) {
      lines.push({ type: 'added', key, newValue: next.serial, tag: next.tag })
    }
  }

  return lines
}

export function EventPreviewDiff({
  originalTags,
  newTags,
  originalKind,
  newKind,
  newContent,
}: EventPreviewDiffProps) {
  const [expanded, setExpanded] = useState(false)
  const [showRawJson, setShowRawJson] = useState(false)
  const [copied, setCopied] = useState(false)

  const diff = useMemo(() => computeDiff(originalTags, newTags), [originalTags, newTags])

  const hasChanges = useMemo(
    () => diff.some(l => l.type !== 'unchanged') || originalKind !== newKind,
    [diff, originalKind, newKind]
  )

  const changeCount = useMemo(
    () => diff.filter(l => l.type !== 'unchanged').length + (originalKind !== newKind ? 1 : 0),
    [diff, originalKind, newKind]
  )

  const rawNewEvent = useMemo(
    () =>
      JSON.stringify(
        {
          kind: newKind,
          content: newContent,
          created_at: '<generated on publish>',
          tags: newTags,
        },
        null,
        2
      ),
    [newKind, newContent, newTags]
  )

  const handleCopy = async () => {
    await navigator.clipboard.writeText(rawNewEvent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const bgColor = (type: DiffLine['type']) => {
    switch (type) {
      case 'added':
        return 'bg-green-500/10'
      case 'removed':
        return 'bg-red-500/10'
      case 'changed':
        return 'bg-amber-500/10'
      default:
        return ''
    }
  }

  const prefix = (type: DiffLine['type']) => {
    switch (type) {
      case 'added':
        return '+'
      case 'removed':
        return '-'
      case 'changed':
        return '~'
      default:
        return ' '
    }
  }

  const textColor = (type: DiffLine['type']) => {
    switch (type) {
      case 'added':
        return 'text-green-400'
      case 'removed':
        return 'text-red-400'
      case 'changed':
        return 'text-amber-400'
      default:
        return 'text-muted-foreground'
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span>
          Preview Changes
          {hasChanges ? (
            <span className="ml-1.5 text-xs text-amber-500">
              ({changeCount} {changeCount === 1 ? 'change' : 'changes'})
            </span>
          ) : (
            <span className="ml-1.5 text-xs text-muted-foreground">(no changes)</span>
          )}
        </span>
      </button>

      {expanded && (
        <div className="space-y-2">
          {/* Toggle between diff and raw JSON */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={showRawJson ? 'ghost' : 'secondary'}
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setShowRawJson(false)}
            >
              Diff
            </Button>
            <Button
              type="button"
              variant={showRawJson ? 'secondary' : 'ghost'}
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setShowRawJson(true)}
            >
              Raw JSON
            </Button>
            {showRawJson && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs ml-auto"
                onClick={handleCopy}
              >
                {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            )}
          </div>

          {showRawJson ? (
            /* Raw JSON view */
            <pre className="max-h-80 overflow-auto rounded-md bg-muted/50 p-3 text-xs font-mono whitespace-pre-wrap break-all">
              {rawNewEvent}
            </pre>
          ) : (
            /* Diff view */
            <div className="max-h-80 overflow-auto rounded-md bg-muted/50 text-xs font-mono">
              {/* Kind change */}
              {originalKind !== newKind && (
                <div className="bg-amber-500/10 px-3 py-1">
                  <span className="text-amber-400">~ kind: </span>
                  <span className="text-red-400 line-through">{originalKind}</span>
                  <span className="text-green-400"> {newKind}</span>
                </div>
              )}

              {/* Tag diff */}
              {diff.map((line, i) => (
                <div key={i} className={`px-3 py-0.5 ${bgColor(line.type)}`}>
                  {line.type === 'changed' ? (
                    <div>
                      <div className="text-red-400 opacity-60">
                        {'- '}
                        {line.originalValue}
                      </div>
                      <div className="text-green-400">
                        {'+ '}
                        {line.newValue}
                      </div>
                    </div>
                  ) : (
                    <div className={textColor(line.type)}>
                      <span>{prefix(line.type)} </span>
                      {line.type === 'removed'
                        ? line.originalValue
                        : line.newValue || serializeTag(line.tag)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
