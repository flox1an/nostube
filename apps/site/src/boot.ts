import { createNostubeClient, type NostubeClient } from '@nostube/core/client'
import type { InstanceConfig } from '@nostube/core/instance-config'
import { loadSiteConfig } from './site-config'
import { applyTheme } from './theme'

export interface SiteBoot {
  config: InstanceConfig
  client: NostubeClient
}

/**
 * Loads and registers the instance config, then creates the one client. Call it once, outside
 * React, so StrictMode's double effects cannot register the config or create a client twice.
 */
export async function bootSite(): Promise<SiteBoot> {
  const config = await loadSiteConfig()
  // Before the first render, so the page never flashes in the default look.
  applyTheme(config.site)
  document.title = config.title
  const client = createNostubeClient({
    defaultRelays: config.interactionRelays,
    instance: config,
    debug: import.meta.env.DEV,
  })
  return { config, client }
}
