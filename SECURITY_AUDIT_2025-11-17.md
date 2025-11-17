# Security & Package Update Audit - November 17, 2025

## Security Status ✅

**No vulnerabilities found!** Project is currently secure with no known CVEs in dependencies.

```bash
npm audit
# found 0 vulnerabilities
```

## Package Update Analysis

### Critical Updates Available

#### 1. React 18 → 19 (Can Now Upgrade! ✨)

- **Current**: `react@18.3.1`, `react-dom@18.3.1`
- **Latest**: `react@19.2.0`, `react-dom@19.2.0`
- **Status**: **shadcn/ui now fully supports React 19**
- **Installation**: May require `--legacy-peer-deps` flag for npm
- **Breaking changes**: Yes - review [React 19 release notes](https://react.dev/blog/2024/12/05/react-19)
  - New hooks (useActionState, useFormStatus, useOptimistic)
  - Ref handling changes (element.ref removed)
  - Server Components support

**Recommendation**: ✅ **Safe to upgrade**, but test thoroughly after upgrade

#### 2. Applesauce Core & Relay

- **applesauce-core**: `4.2.0` → `4.4.2` (2 minor versions behind)
- **applesauce-relay**: `4.2.0` → `4.4.2` (2 minor versions behind)
- **Breaking changes**: Unlikely (minor version bumps)

**Recommendation**: ✅ **Safe to upgrade**

### Major Version Jumps (Breaking Changes Possible)

#### 3. nostr-idb `3.0.0` → `4.0.1`

- **Type**: Major version jump
- **Impact**: Low (only used as cache layer per CLAUDE.md)
- **Risk**: Breaking API changes possible

**Recommendation**: ⚠️ **Upgrade with caution** - Test caching behavior

#### 4. react-intersection-observer `9.16.0` → `10.0.0`

- **Type**: Major version jump
- **Usage**: Infinite scroll functionality
- **Risk**: Medium - breaking API changes possible

**Recommendation**: ⚠️ **Check release notes first**

#### 5. vitest `3.2.4` → `4.0.10`

- **Type**: Major version jump (dev dependency)
- **Impact**: Test runner only
- **Risk**: Low - may require test config updates

**Recommendation**: ⚠️ **Upgrade separately** and verify tests pass

### Safe Minor/Patch Updates

Low-risk updates with bug fixes and improvements:

| Package                    | Current | Latest  |
| -------------------------- | ------- | ------- |
| @html-eslint/eslint-plugin | 0.47.1  | 0.48.0  |
| @html-eslint/parser        | 0.47.1  | 0.48.0  |
| @types/node                | 24.10.0 | 24.10.1 |
| @types/react               | 19.2.2  | 19.2.5  |
| @types/react-dom           | 19.2.2  | 19.2.3  |
| @vitejs/plugin-react       | 5.1.0   | 5.1.1   |
| @vitejs/plugin-react-swc   | 4.2.1   | 4.2.2   |
| jsdom                      | 27.1.0  | 27.2.0  |
| lucide-react               | 0.546.0 | 0.554.0 |
| react-hook-form            | 7.66.0  | 7.66.1  |
| react-router-dom           | 7.9.5   | 7.9.6   |
| typescript-eslint          | 8.46.4  | 8.47.0  |

**Recommendation**: ✅ **Safe to update all of these**

## Recommended Upgrade Strategy

### Option A: Conservative (Recommended)

**Phase 1 - Safe Updates**

```bash
npm update  # Updates all minor/patch versions
npm run test && npm run build
```

**Phase 2 - Applesauce Updates**

```bash
npm install applesauce-core@latest applesauce-relay@latest
npm run test && npm run build
```

**Phase 3 - React 19 (Optional)**

```bash
npm install react@19 react-dom@19 @types/react@19 @types/react-dom@19 --legacy-peer-deps
npm run test && npm run build
```

⚠️ Test thoroughly: video playback, infinite scroll, Nostr interactions

### Option B: Aggressive (All at once)

```bash
npm install react@19 react-dom@19 @types/react@19 @types/react-dom@19 \
  nostr-idb@4 react-intersection-observer@10 vitest@4 --legacy-peer-deps
npm update
npm run test && npm run build
```

⚠️ Be prepared to debug multiple issues at once

## React 19 & shadcn/ui Compatibility

**Answer**: ✅ **Yes, you can upgrade to React 19!**

- shadcn/ui officially added full React 19 support in their latest release
- All Radix UI components support React 19 as peer dependencies
- May see peer dependency warnings during `npm install`, but safe to bypass with `--legacy-peer-deps`
- Recharts requires overriding `react-is` dependency for React 19

## Next Steps

1. **Immediate**: Apply safe minor/patch updates with `npm update`
2. **Soon**: Update Applesauce packages (minor versions)
3. **When ready**: Plan React 19 upgrade with dedicated testing
4. **Monitor**: Check for updates to nostr-idb, react-intersection-observer, and vitest

## References

- [shadcn/ui React 19 Support](https://ui.shadcn.com/docs/react-19)
- [React 19 Release Notes](https://react.dev/blog/2024/12/05/react-19)
- [Radix UI React 19 Compatibility](https://github.com/radix-ui/primitives/issues/2900)
