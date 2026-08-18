import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppConfig } from '@/contexts/AppContext'
import { GeneralSettingsSection } from './GeneralSettingsSection'

const mocks = vi.hoisted(() => ({
  updateConfig: vi.fn(),
}))

const config: AppConfig = {
  theme: 'dark',
  relays: [],
  videoType: 'videos',
  nsfwFilter: 'hide',
}

vi.mock('@/hooks', () => ({
  useAppContext: () => ({ config, updateConfig: mocks.updateConfig }),
  useCurrentUser: () => ({ user: undefined }),
  useFollowSet: () => ({
    hasKind3Contacts: false,
    kind3PubkeyCount: 0,
    importFromKind3: vi.fn(),
    importProgress: { phase: 'idle', checked: 0, total: 0, withVideos: 0 },
    cancelImport: vi.fn(),
  }),
}))

vi.mock('@/providers/theme-provider', () => ({
  useTheme: () => ({
    theme: 'dark',
    setTheme: vi.fn(),
    colorTheme: 'default',
    setColorTheme: vi.fn(),
  }),
}))

describe('GeneralSettingsSection', () => {
  beforeEach(() => mocks.updateConfig.mockClear())

  it('stores a normalized personal imgproxy endpoint in the local app configuration', () => {
    render(<GeneralSettingsSection />)

    fireEvent.change(screen.getByLabelText('Image Proxy URL'), {
      target: { value: ' http://localhost:8081/ ' },
    })

    const updater = mocks.updateConfig.mock.calls[0]?.[0] as (currentConfig: AppConfig) => AppConfig
    expect(updater(config)).toMatchObject({ imgproxyBaseUrl: 'http://localhost:8081' })
  })
})
