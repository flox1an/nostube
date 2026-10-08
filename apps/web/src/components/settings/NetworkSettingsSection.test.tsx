import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AppConfig } from '@/types/app-config'
import { getImgproxyBaseUrl } from '@/lib/imgproxy-config'
import { ServiceEndpointsSubSection } from './NetworkSettingsSection'

const store = vi.hoisted(() => ({
  config: {} as AppConfig,
  update: (_updater: (config: AppConfig) => AppConfig) => {},
}))

vi.mock('@/hooks', () => ({
  useAppContext: () => ({ config: store.config, updateConfig: store.update }),
}))

vi.mock('@/contexts/PrivateRelaysContext', () => ({
  usePrivateRelays: vi.fn(),
}))

/** Keeps the config in real React state so the input stays controlled like in the app. */
function Harness() {
  const [config, setConfig] = useState<AppConfig>({
    theme: 'dark',
    relays: [],
    videoType: 'videos',
    nsfwFilter: 'hide',
  })
  store.config = config
  store.update = updater => setConfig(updater)
  return <ServiceEndpointsSubSection />
}

describe('ServiceEndpointsSubSection', () => {
  it('lets a personal imgproxy URL be typed character by character', () => {
    render(<Harness />)
    const input = screen.getByLabelText('Image Proxy URL') as HTMLInputElement

    for (const char of 'http://localhost:8081/') {
      fireEvent.change(input, { target: { value: input.value + char } })
    }

    expect(input.value).toBe('http://localhost:8081/')
    expect(getImgproxyBaseUrl(store.config.imgproxyBaseUrl)).toBe('http://localhost:8081')
  })
})
