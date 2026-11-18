import { afterEach, describe, expect, it } from 'vitest'
import {
  createOpfsWritable,
  openTranscodeSink,
  type OpfsDirHandle,
  type OpfsFileHandle,
  type SyncAccessHandle,
} from './transcode-sink'

class FakeFile implements OpfsFileHandle {
  bytes = new Uint8Array(0)
  truncated = false
  closed = false

  async createSyncAccessHandle(): Promise<SyncAccessHandle> {
    let size = this.bytes.byteLength
    return {
      write: (data, options) => {
        const chunk = ArrayBuffer.isView(data)
          ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
          : new Uint8Array(data)
        const at = options?.at ?? size
        if (at + chunk.byteLength > this.bytes.byteLength) {
          const grown = new Uint8Array(at + chunk.byteLength)
          grown.set(this.bytes)
          this.bytes = grown
        }
        this.bytes.set(chunk, at)
        size = Math.max(size, at + chunk.byteLength)
        return chunk.byteLength
      },
      truncate: length => {
        this.truncated = true
        this.bytes = this.bytes.slice(0, length)
        size = length
      },
      flush: () => {},
      close: () => {
        this.closed = true
      },
    }
  }

  async getFile(): Promise<File> {
    return new File([this.bytes], this.name)
  }

  constructor(readonly name: string) {}
}

class FakeDir implements OpfsDirHandle {
  readonly dirs = new Map<string, FakeDir>()
  readonly files = new Map<string, FakeFile>()
  readonly removed: string[] = []

  async getDirectoryHandle(name: string): Promise<OpfsDirHandle> {
    let dir = this.dirs.get(name)
    if (!dir) {
      dir = new FakeDir()
      this.dirs.set(name, dir)
    }
    return dir
  }

  async getFileHandle(name: string): Promise<OpfsFileHandle> {
    let file = this.files.get(name)
    if (!file) {
      file = new FakeFile(name)
      this.files.set(name, file)
    }
    return file
  }

  async removeEntry(name: string): Promise<void> {
    this.removed.push(name)
    this.dirs.delete(name)
  }

  async *entries(): AsyncIterableIterator<[string, OpfsDirHandle]> {
    for (const [name, dir] of this.dirs) yield [name, dir]
  }
}

const setStorage = (storage: unknown) =>
  Object.defineProperty(navigator, 'storage', { value: storage, configurable: true })

/** jsdom has no OPFS; a stand-in only needs the capability the sink checks for. */
class FakeFileSystemFileHandle {
  createSyncAccessHandle() {}
}

const enableOpfs = () =>
  Object.defineProperty(globalThis, 'FileSystemFileHandle', {
    value: FakeFileSystemFileHandle,
    configurable: true,
  })

afterEach(() => {
  setStorage(undefined)
  Reflect.deleteProperty(globalThis, 'FileSystemFileHandle')
})

describe('createOpfsWritable', () => {
  it('writes chunks at their own positions into an emptied file and closes the handle', async () => {
    const file = new FakeFile('a.mp4')
    const writable = createOpfsWritable(async () => file)
    const writer = writable.getWriter()

    await writer.write({ type: 'write', data: new Uint8Array([1, 2]), position: 2 })
    await writer.write({ type: 'write', data: new Uint8Array([3]), position: 0 })
    await writer.close()

    expect(file.truncated).toBe(true)
    expect([...file.bytes]).toEqual([3, 0, 1, 2])
    expect(file.closed).toBe(true)
  })
})

describe('openTranscodeSink', () => {
  it('writes through OPFS when the storage manager offers it and drops stale job directories', async () => {
    const root = new FakeDir()
    const jobs = (await root.getDirectoryHandle('nostube-transcode')) as FakeDir
    const stale = `${Date.now() - 2 * 60 * 60 * 1000}-stale`
    jobs.dirs.set(stale, new FakeDir())
    enableOpfs()
    setStorage({ getDirectory: async () => root, estimate: async () => ({ quota: 1e12, usage: 0 }) })

    const sink = await openTranscodeSink({ expectedBytes: 1e6 })
    expect(sink.kind).toBe('opfs')
    expect(jobs.removed).toEqual([stale])

    const file = await sink.file('variant-0/init.mp4', 'video/mp4')
    expect(file.name).toBe('init.mp4')
    expect(file.type).toBe('video/mp4')
  })

  it('stays in memory when the free quota cannot hold the estimate', async () => {
    enableOpfs()
    setStorage({ getDirectory: async () => new FakeDir(), estimate: async () => ({ quota: 1e6 }) })

    expect((await openTranscodeSink({ expectedBytes: 1e9 })).kind).toBe('memory')
  })

  it('stays in memory when the browser has no OPFS or denies it', async () => {
    setStorage(undefined)
    expect((await openTranscodeSink()).kind).toBe('memory')

    setStorage({
      getDirectory: async () => {
        throw new Error('denied')
      },
    })
    expect((await openTranscodeSink()).kind).toBe('memory')
  })
})
