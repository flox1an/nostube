import {
  parseInstanceConfig,
  setInstanceConfig,
  type InstanceConfig,
} from '@nostube/core/instance-config'

/**
 * Loads and applies the instance config from the server (`/api/config`, contract v1). It must
 * run before the client is created: the relay allowlist is read from the registered config.
 */
export async function loadSiteConfig(fetchImpl: typeof fetch = fetch): Promise<InstanceConfig> {
  const response = await fetchImpl('/api/config')
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`/api/config answered ${response.status}${detail ? `: ${detail}` : ''}`)
  }
  const parsed = parseInstanceConfig(await response.json())
  if (!parsed.ok) throw new Error(`Invalid instance config: ${parsed.errors.join('; ')}`)
  setInstanceConfig(parsed.config)
  return parsed.config
}
