function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Inject meta tags into the HTML template by replacing existing OG/Twitter meta tags
 * and inserting the new ones before </head>.
 */
export function injectMeta(html: string, metaTags: string, title: string): string {
  // Remove existing OG and Twitter meta tags (they have default values)
  let result = html
    .replace(/<meta\s+property="og:[^"]*"\s+content="[^"]*"\s*\/?>/g, '')
    .replace(/<meta\s+name="twitter:[^"]*"\s+content="[^"]*"\s*\/?>/g, '')

  // Replace the <title> tag
  result = result.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapeHtmlText(title)} - nostube</title>`
  )

  // Insert new meta tags before </head>
  result = result.replace('</head>', `    ${metaTags}\n  </head>`)

  return result
}
