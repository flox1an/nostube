export const DEFAULT_IMGPROXY_BASE_URL = 'https://imgproxy.nostu.be'

export function getImgproxyBaseUrl(override?: string): string {
  return override?.trim().replace(/\/+$/, '') || DEFAULT_IMGPROXY_BASE_URL
}
