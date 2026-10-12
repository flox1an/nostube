import {
  applyInstanceConfig,
  loadInstanceConfig,
  type InstanceConfig,
} from '@nostube/core/instance-config'

/** The element the server writes the public config into (`INLINE_CONFIG_ID` in `seo.rs`). */
export const INLINE_CONFIG_ID = 'nostube-config'

/**
 * The instance config: the copy the server put into the page when there is one (no request
 * before the first render), else `/api/config` (the Vite dev server serves the shell as it is).
 */
export async function loadSiteConfig(fetchImpl: typeof fetch = fetch): Promise<InstanceConfig> {
  const inline = document.getElementById(INLINE_CONFIG_ID)?.textContent
  return inline ? applyInstanceConfig(JSON.parse(inline)) : loadInstanceConfig(fetchImpl)
}
