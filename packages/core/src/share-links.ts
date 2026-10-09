/** Share links of a video page for mail and the common social networks. */
export function buildShareLinks(
  shareUrl: string,
  fullUrl: string,
  title: string,
  thumbnailUrl: string
) {
  const encode = encodeURIComponent
  const eUrl = encode(shareUrl)
  const eFull = encode(fullUrl)
  const eTitle = encode(title)
  const eThumb = encode(thumbnailUrl)

  return {
    mailto: `mailto:?body=${eUrl}`,
    whatsapp: `https://api.whatsapp.com/send/?text=${eTitle}%20${eUrl}`,
    x: `https://x.com/intent/tweet?url=${eUrl}&text=${eTitle}`,
    reddit: `https://www.reddit.com/submit?url=${eFull}&title=${eTitle}`,
    facebook: `https://www.facebook.com/share_channel/?type=reshare&link=${eFull}&display=popup`,
    pinterest: `https://www.pinterest.com/pin/create/button/?url=${eFull}&description=${eTitle}&is_video=true&media=${eThumb}`,
  }
}
