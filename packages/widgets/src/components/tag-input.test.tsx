import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TagInput } from './tag-input'

afterEach(cleanup)

describe('TagInput', () => {
  it('normalizes and deduplicates manual tags without an EventStore or search provider', () => {
    const onTagsChange = vi.fn()
    render(<TagInput tags={['nostr']} onTagsChange={onTagsChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '#Nostr, #Video video' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onTagsChange).toHaveBeenCalledWith(['nostr', 'video'])
  })

  it('uses injected autocomplete and excludes tags already selected', () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
    const onTagsChange = vi.fn()
    const search = vi.fn(() => [
      { tag: 'nostr', count: 10 },
      { tag: 'nostube', count: 5 },
    ])
    render(<TagInput tags={['nostr']} onTagsChange={onTagsChange} search={search} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'nos' } })
    expect(search).toHaveBeenCalledWith('nos', 8)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onTagsChange).toHaveBeenCalledWith(['nostr', 'nostube'])
  })

  it('locks input and removal while disabled', () => {
    const onTagsChange = vi.fn()
    const search = vi.fn()
    render(<TagInput tags={['nostr']} onTagsChange={onTagsChange} search={search} disabled />)
    expect(screen.getByRole('textbox')).toBeDisabled()
    const remove = screen.getByRole('button', { name: 'Remove #nostr' })
    expect(remove).toBeDisabled()
    fireEvent.click(remove)
    expect(onTagsChange).not.toHaveBeenCalled()
    expect(search).not.toHaveBeenCalled()
  })
})
