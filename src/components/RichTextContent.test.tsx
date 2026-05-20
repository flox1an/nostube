import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RichTextContent } from './RichTextContent'

describe('RichTextContent', () => {
  it('does not include trailing punctuation in YouTube channel links', () => {
    const { container } = render(
      <RichTextContent content="Channel: https://www.youtube.com/channel/UCqDgpnqBDNHUjM5AQ4jsz4A." />
    )

    const link = screen.getByRole('link', { name: /YouTube/i })

    expect(link).toHaveAttribute(
      'href',
      'https://www.youtube.com/channel/UCqDgpnqBDNHUjM5AQ4jsz4A'
    )
    expect(link).toHaveTextContent('UCqDgpnqBDNHUjM5AQ4jsz4A')
    expect(container).toHaveTextContent(/UCqDgpnqBDNHUjM5AQ4jsz4A\.$/)
  })

  it('does not include trailing punctuation in regular links', () => {
    render(<RichTextContent content="Read https://example.com/path, then continue." />)

    const link = screen.getByRole('link', { name: 'https://example.com/path' })

    expect(link).toHaveAttribute('href', 'https://example.com/path')
    expect(screen.getByText(/, then continue\./)).toBeInTheDocument()
  })
})
