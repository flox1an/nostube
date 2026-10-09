import { NostrConnectSigner } from 'applesauce-signers'
import { AccountManager } from 'applesauce-accounts'
import { registerCommonAccountTypes } from 'applesauce-accounts/accounts'
import { createNostubeClient, type NostubeClient } from '@nostube/core/client'
import type { InstanceConfig } from '@nostube/core/instance-config'
import { loadSiteConfig } from './site-config'
import { applyTheme } from '@nostube/widgets/site-theme'

export interface SiteBoot {
  config: InstanceConfig
  client: NostubeClient
  accountManager: AccountManager
}

/**
 * Loads and registers the instance config, then creates the one client and account manager.
 * Call it once, outside React, so StrictMode's double effects cannot register the config or
 * create a client twice.
 */
export async function bootSite(): Promise<SiteBoot> {
  const config = await loadSiteConfig()
  // Before the first render, so the page never flashes in the default look.
  applyTheme(config.site)
  document.title = config.title
  if (config.site.favicon) {
    const icon = document.createElement('link')
    icon.rel = 'icon'
    icon.href = config.site.favicon
    document.head.append(icon)
  }
  const client = createNostubeClient({
    defaultRelays: config.interactionRelays,
    instance: config,
    debug: import.meta.env.DEV,
  })
  // NIP-46 transport for bunker login and the QR signer (the web app does the same).
  NostrConnectSigner.subscriptionMethod = client.subscriptionMethod
  NostrConnectSigner.publishMethod = client.publishMethod
  const accountManager = new AccountManager()
  registerCommonAccountTypes(accountManager)
  return { config, client, accountManager }
}
