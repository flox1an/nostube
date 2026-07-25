# Desktop releases

The desktop release workflow runs only when a version tag matching `v*.*.*` is
pushed. It builds a GitHub Release from that tag with:

- macOS Apple Silicon DMG
- macOS Intel DMG
- Windows x64 NSIS installer
- Linux x64 AppImage and Debian package

macOS artifacts are intentionally not signed with an Apple Developer ID. Tauri
is configured to use ad-hoc signing (`signingIdentity: "-"`) so the application
bundle has a local code signature without requiring Apple certificates,
notarization, or personal-signing secrets.
