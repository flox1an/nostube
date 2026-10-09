import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { registerWidgetTranslations, widgetResources } from './index'

const srcDir = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

const lookup = (resources: object, key: string) =>
  key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], resources)

describe('widget translations', () => {
  const keys = new Set<string>()
  for (const file of sourceFiles(srcDir)) {
    for (const match of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([^']+)'/g)) {
      keys.add(match[1])
    }
  }

  it('finds the keys the widgets use', () => {
    expect(keys.size).toBeGreaterThan(0)
  })

  for (const [lng, resources] of Object.entries(widgetResources)) {
    it(`has every used key in ${lng}`, () => {
      for (const key of keys) {
        expect(lookup(resources, key), `${lng}: ${key}`).toBeTypeOf('string')
      }
    })
  }

  it('merges into the host without overwriting its own keys', () => {
    const calls: unknown[][] = []
    registerWidgetTranslations({ addResourceBundle: (...args) => calls.push(args) })
    expect(calls).toHaveLength(Object.keys(widgetResources).length)
    expect(calls.every(c => c[1] === 'translation' && c[3] === true && c[4] === false)).toBe(true)
  })
})
