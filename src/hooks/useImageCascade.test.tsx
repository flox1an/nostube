import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useImageCascade, type ImageCascadeInput } from './useImageCascade'

const BLOSSOM_HASH = 'a'.repeat(64)
const BLOSSOM_URL = `https://blossom.example/${BLOSSOM_HASH}.jpg`
const DIRECT_URL = 'https://cdn.example.com/photo.jpg'

function Probe(props: ImageCascadeInput) {
  const cascade = useImageCascade(props)
  return (
    <div
      data-testid="probe"
      data-src={cascade.src ?? ''}
      data-stage={cascade.stage}
      data-exhausted={cascade.exhausted}
      onClick={cascade.onError}
    />
  )
}

function probeSrc() {
  return screen.getByTestId('probe').getAttribute('data-src')
}

function probeStage() {
  return screen.getByTestId('probe').getAttribute('data-stage')
}

function triggerError() {
  act(() => {
    screen.getByTestId('probe').click()
  })
}

describe('useImageCascade', () => {
  it('routes a Blossom-hash image through the signature-free preset route', () => {
    render(<Probe src={BLOSSOM_URL} />)
    expect(probeStage()).toBe('proxied')
    expect(probeSrc()).toBe(
      `https://imgproxy.nostu.be/v1/preset/feed-preview-v1/${BLOSSOM_HASH}.jpg?xs=blossom.example`
    )
  })

  it('routes a non-Blossom image through the legacy insecure route', () => {
    render(<Probe src={DIRECT_URL} />)
    expect(probeStage()).toBe('proxied')
    expect(probeSrc()).toBe(
      'https://imgproxy.nostu.be/insecure/f:webp/q:82/rs:fit:480:480/plain/https%3A%2F%2Fcdn.example.com%2Fphoto.jpg'
    )
  })

  it('falls back to the raw URL when the proxied Blossom URL fails', () => {
    render(<Probe src={BLOSSOM_URL} />)
    expect(probeStage()).toBe('proxied')

    triggerError()

    expect(probeStage()).toBe('raw')
    expect(probeSrc()).toBe(BLOSSOM_URL)
  })

  it('falls back to the raw URL when the proxied insecure URL fails', () => {
    render(<Probe src={DIRECT_URL} />)
    expect(probeStage()).toBe('proxied')

    triggerError()

    expect(probeStage()).toBe('raw')
    expect(probeSrc()).toBe(DIRECT_URL)
  })

  it('exhausts after the raw fallback also fails, with no video to fall back to', () => {
    render(<Probe src={DIRECT_URL} />)
    triggerError()
    expect(probeStage()).toBe('raw')

    triggerError()

    expect(probeStage()).toBe('exhausted')
    expect(probeSrc()).toBe('')
  })

  it('falls back to a proxied video frame for a non-Blossom video URL once image fallbacks are exhausted', () => {
    const videoUrl = 'https://cdn.example.com/clip.mp4'
    render(<Probe src={DIRECT_URL} videoUrl={videoUrl} />)
    triggerError() // proxied -> raw
    triggerError() // raw -> video-frame

    expect(probeStage()).toBe('video-frame')
    expect(probeSrc()).toBe(
      'https://imgproxy.nostu.be/insecure/f:webp/q:82/rs:fit:480:480/plain/https%3A%2F%2Fcdn.example.com%2Fclip.mp4'
    )
  })

  it('does not proxy blob: or data: URLs', () => {
    render(<Probe src="blob:https://nostube.example/1234" />)
    expect(probeStage()).toBe('raw')
    expect(probeSrc()).toBe('blob:https://nostube.example/1234')
  })

  it('shows nothing once every candidate is exhausted', () => {
    render(<Probe src={null} />)
    expect(probeStage()).toBe('exhausted')
    expect(probeSrc()).toBe('')
  })
})
