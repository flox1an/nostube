// Applies the saved theme mode and palette to <html> before first paint (#112). Loaded as a
// blocking same-origin script from index.html (the CSP forbids inline scripts). Storage keys and
// values are written by ThemeProvider; see THEME_*_STORAGE_KEY in src/lib/themes.ts.
;(function () {
  try {
    var root = document.documentElement
    var saved = localStorage.getItem('nostr-tube-theme')
    var mode =
      saved === 'light' || saved === 'dark'
        ? saved
        : matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
    root.classList.add(mode)
    var vars = (JSON.parse(localStorage.getItem('nostube-theme-vars') || 'null') || {})[mode]
    for (var name in vars) root.style.setProperty(name, vars[name])
  } catch {
    // Storage unavailable or corrupt: ThemeProvider applies the theme once the app starts.
  }
})()
