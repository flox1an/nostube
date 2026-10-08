/**
 * Shared array utility functions.
 */

/**
 * Split an array into chunks of a specified size.
 *
 * @example
 * chunk([1, 2, 3, 4, 5], 2) // [[1, 2], [3, 4], [5]]
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr]
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}

/**
 * Remove duplicate items from an array based on a key function.
 *
 * @example
 * uniqueBy([{id: 1, name: 'a'}, {id: 1, name: 'b'}], item => item.id)
 * // [{id: 1, name: 'a'}]
 */
export function uniqueBy<T, K>(arr: T[], keyFn: (item: T) => K): T[] {
  const seen = new Set<K>()
  return arr.filter(item => {
    const key = keyFn(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Group array items by a key function.
 *
 * @example
 * groupBy([{type: 'a', val: 1}, {type: 'b', val: 2}, {type: 'a', val: 3}], item => item.type)
 * // Map { 'a' => [{type: 'a', val: 1}, {type: 'a', val: 3}], 'b' => [{type: 'b', val: 2}] }
 */
export function groupBy<T, K>(arr: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const result = new Map<K, T[]>()
  for (const item of arr) {
    const key = keyFn(item)
    const group = result.get(key) || []
    group.push(item)
    result.set(key, group)
  }
  return result
}

/**
 * Interleave two arrays by alternating items.
 *
 * @example
 * interleave([1, 2, 3], ['a', 'b']) // [1, 'a', 2, 'b', 3]
 */
export function interleave<T, U>(arr1: T[], arr2: U[]): (T | U)[] {
  const result: (T | U)[] = []
  const maxLen = Math.max(arr1.length, arr2.length)
  for (let i = 0; i < maxLen; i++) {
    if (i < arr1.length) result.push(arr1[i])
    if (i < arr2.length) result.push(arr2[i])
  }
  return result
}
