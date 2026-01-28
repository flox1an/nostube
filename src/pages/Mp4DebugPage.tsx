import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Loader2, Info, AlertCircle } from 'lucide-react'
import * as MP4Box from 'mp4box'
import type { Movie } from 'mp4box'
import { extractMetadataFromUrl } from '@/lib/metadata-extraction'
import { parseIlstMetadata, extractThumbnailFromFile } from '@/lib/mp4box-atoms'

/**
 * Safe JSON stringification that handles large objects and circular references
 */
function safeStringify(obj: any, maxDepth = 5, currentDepth = 0): string {
  try {
    const seen = new WeakSet()

    const replacer = (_key: string, value: any) => {
      // Limit depth
      if (currentDepth >= maxDepth) {
        return '[Max depth reached]'
      }

      if (typeof value === 'object' && value !== null) {
        // Handle circular references
        if (seen.has(value)) {
          return '[Circular]'
        }
        seen.add(value)

        // Skip very large typed arrays
        if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
          if (value.byteLength > 1000) {
            return `[${value.constructor.name}: ${value.byteLength} bytes]`
          }
          // Convert small arrays to hex string
          if (value instanceof Uint8Array) {
            return `[Uint8Array: ${Array.from(value.slice(0, 20))
              .map(b => b.toString(16).padStart(2, '0'))
              .join(' ')}${value.length > 20 ? '...' : ''}]`
          }
        }

        // Limit array length
        if (Array.isArray(value) && value.length > 100) {
          return `[Array with ${value.length} items - showing first 100]`
        }
      }

      return value
    }

    return JSON.stringify(obj, replacer, 2)
  } catch (e) {
    return `Error stringifying: ${e instanceof Error ? e.message : String(e)}`
  }
}

interface Mp4BoxData {
  movie?: Movie
  boxes: any[]
  moov?: any
  udta?: any
  meta?: any
  ilst?: any
  ilstParsed?: Record<string, any>
  extractedMetadata?: any
  rawBoxTree?: string
  thumbnail?: { type: string; dataUrl: string; source?: string } | null
}

export function Mp4DebugPage() {
  const [url, setUrl] = useState(
    'https://almond1.b-cdn.net/ecf8f3a25b4a6109c5aa6ea90ee97f8cafec09f99a2f71f0e6253c3bdf26ccea?xs=almond.slidestr.net&as=b7c6f6915cfa9a62fff6a1f02604de88c23c6c6c6d1b8f62c7cc10749f307e81'
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<Mp4BoxData | null>(null)

  const analyzeVideo = async () => {
    if (!url) {
      setError('Please enter a video URL')
      return
    }

    setLoading(true)
    setError(null)
    setData(null)

    try {
      // Fetch first 5MB of video
      const CHUNK_SIZE = 5 * 1024 * 1024
      const response = await fetch(url, {
        headers: {
          Range: `bytes=0-${CHUNK_SIZE}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Fetch failed: ${response.status} ${response.statusText}`)
      }

      let arrayBuffer: ArrayBuffer

      if (response.status === 206) {
        arrayBuffer = await response.arrayBuffer()
      } else if (response.status === 200) {
        // Server doesn't support range requests
        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response body')

        const chunks: Uint8Array[] = []
        let totalBytes = 0

        while (totalBytes < CHUNK_SIZE) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          totalBytes += value.length
        }

        reader.cancel()

        const combined = new Uint8Array(Math.min(totalBytes, CHUNK_SIZE))
        let offset = 0
        for (const chunk of chunks) {
          const remaining = CHUNK_SIZE - offset
          const toCopy = Math.min(chunk.length, remaining)
          combined.set(chunk.subarray(0, toCopy), offset)
          offset += toCopy
          if (offset >= CHUNK_SIZE) break
        }
        arrayBuffer = combined.buffer
      } else {
        throw new Error('Range request failed')
      }

      // Parse with MP4Box
      const result = await new Promise<Mp4BoxData>((resolve, reject) => {
        const mp4boxfile = MP4Box.createFile()
        let resolved = false

        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true
            reject(new Error('MP4Box parsing timeout'))
          }
        }, 10000)

        mp4boxfile.onError = (err: unknown) => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            reject(err)
          }
        }

        mp4boxfile.onReady = (info: Movie) => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)

            const fileData = mp4boxfile as any

            // Extract all relevant data
            const boxData: Mp4BoxData = {
              movie: info,
              boxes: fileData.boxes || [],
              moov: fileData.moov,
              udta: fileData.moov?.udta,
              meta: fileData.moov?.udta?.meta,
              ilst: fileData.moov?.udta?.meta?.ilst,
            }

            // Log udta structure for debugging
            if (import.meta.env.DEV && fileData.moov?.udta) {
              console.log('[MP4DEBUG] UDTA box structure:', fileData.moov.udta)
              if (fileData.moov.udta.boxes) {
                console.log(
                  '[MP4DEBUG] UDTA sub-boxes:',
                  fileData.moov.udta.boxes.map((b: any) => ({
                    type: b.type,
                    size: b.size,
                    hasData: !!b.data,
                    dataLength: b.data?.length,
                  }))
                )
              }
            }

            // Parse ilst if it exists
            if (boxData.ilst) {
              boxData.ilstParsed = parseIlstMetadata(boxData.ilst)
            }

            // Extract thumbnail from any source (ilst or free boxes)
            boxData.thumbnail = extractThumbnailFromFile(mp4boxfile)

            // Generate box tree (with size limit to prevent crashes)
            try {
              const seen = new WeakSet()
              const replacer = (_key: string, value: any) => {
                if (typeof value === 'object' && value !== null) {
                  if (seen.has(value)) {
                    return '[Circular]'
                  }
                  seen.add(value)

                  // Skip very large typed arrays to prevent string size issues
                  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
                    if (value.byteLength > 1000) {
                      return `[${value.constructor.name}: ${value.byteLength} bytes]`
                    }
                  }
                }
                return value
              }

              // Try to stringify, but limit depth and handle errors
              const metaBox = fileData.moov?.udta?.meta
              if (metaBox) {
                boxData.rawBoxTree = JSON.stringify(metaBox, replacer, 2)
              } else {
                boxData.rawBoxTree = 'No meta box found'
              }
            } catch (e) {
              boxData.rawBoxTree = `Error generating box tree: ${e instanceof Error ? e.message : String(e)}`
            }

            resolve(boxData)
          }
        }

        try {
          const mp4boxBuffer = Object.assign(arrayBuffer, { fileStart: 0 })
          mp4boxfile.appendBuffer(mp4boxBuffer)
          mp4boxfile.flush()
        } catch (error) {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            reject(error)
          }
        }
      })

      // Also run our metadata extraction
      try {
        const extractedMetadata = await extractMetadataFromUrl(url)
        result.extractedMetadata = extractedMetadata
      } catch (e) {
        console.error('Metadata extraction failed:', e)
        result.extractedMetadata = { error: String(e) }
      }

      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      <h1 className="text-3xl font-bold mb-6">MP4Box Metadata Debug Tool</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Video URL</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="Enter video URL"
              className="flex-1"
            />
            <Button onClick={analyzeVideo} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                'Analyze'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {data && (
        <div className="space-y-6">
          {/* Thumbnail */}
          {data.thumbnail ? (
            <Card>
              <CardHeader>
                <CardTitle>Embedded Thumbnail</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-muted p-4 rounded-lg space-y-2">
                    <div>
                      <strong>Type:</strong> {data.thumbnail.type.toUpperCase()}
                    </div>
                    <div>
                      <strong>Size:</strong>{' '}
                      {((data.thumbnail.dataUrl.length * 3) / 4 / 1024).toFixed(2)} KB (base64)
                    </div>
                    {data.thumbnail.source && (
                      <div>
                        <strong>Source:</strong>{' '}
                        {data.thumbnail.source === 'ilst'
                          ? 'iTunes metadata (covr atom in moov/udta/meta/ilst)'
                          : `${data.thumbnail.source} box (free space)`}
                      </div>
                    )}
                  </div>
                  <div className="flex justify-center">
                    <img
                      src={data.thumbnail.dataUrl}
                      alt="Embedded thumbnail"
                      className="max-w-full h-auto rounded-lg border border-border"
                      style={{ maxHeight: '400px' }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Embedded Thumbnail</CardTitle>
              </CardHeader>
              <CardContent>
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>No Thumbnail Found</AlertTitle>
                  <AlertDescription>
                    This video does not contain an embedded thumbnail. Checked locations:
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>iTunes metadata: moov/udta/meta/ilst/covr atom</li>
                      <li>Free boxes: free/skip boxes with image data</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}

          {/* Extracted Metadata */}
          <Card>
            <CardHeader>
              <CardTitle>Extracted Metadata (Our Library)</CardTitle>
            </CardHeader>
            <CardContent>
              {data.extractedMetadata && Object.keys(data.extractedMetadata).length === 0 ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>No Metadata Found</AlertTitle>
                  <AlertDescription>
                    This video does not contain iTunes-style metadata in the moov/udta/meta/ilst
                    structure. Check the "Box Navigation Status" below to see which boxes are
                    missing.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2">
                  <div className="space-y-4">
                    {/* Show thumbnail if available */}
                    {data.extractedMetadata?.thumbnail && (
                      <div className="bg-muted p-4 rounded-lg">
                        <div className="font-semibold mb-2">Thumbnail:</div>
                        <div className="flex justify-center">
                          <img
                            src={data.extractedMetadata.thumbnail.dataUrl}
                            alt="Video thumbnail"
                            className="max-w-xs h-auto rounded border border-border"
                          />
                        </div>
                      </div>
                    )}
                    <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
                      {safeStringify(
                        // Exclude thumbnail.data (Uint8Array) from display
                        data.extractedMetadata.thumbnail
                          ? {
                              ...data.extractedMetadata,
                              thumbnail: {
                                type: data.extractedMetadata.thumbnail.type,
                                size: data.extractedMetadata.thumbnail.data.length,
                              },
                            }
                          : data.extractedMetadata
                      )}
                    </pre>
                  </div>
                  {data.extractedMetadata?.publishAt && (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        Publish date:{' '}
                        {new Date(data.extractedMetadata.publishAt * 1000).toLocaleDateString(
                          'en-US',
                          {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          }
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Movie Info */}
          <Card>
            <CardHeader>
              <CardTitle>Movie Info (MP4Box)</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
                {safeStringify(data.movie)}
              </pre>
            </CardContent>
          </Card>

          {/* Box Structure Status */}
          <Card>
            <CardHeader>
              <CardTitle>Box Navigation Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${data.moov ? 'bg-green-500' : 'bg-red-500'}`}
                />
                <span className="font-mono">moov</span>
                <span className="text-muted-foreground">
                  {data.moov ? '✓ Found' : '✗ Not found'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${data.udta ? 'bg-green-500' : 'bg-red-500'}`}
                />
                <span className="font-mono">moov/udta</span>
                <span className="text-muted-foreground">
                  {data.udta ? '✓ Found' : '✗ Not found'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${data.meta ? 'bg-green-500' : 'bg-red-500'}`}
                />
                <span className="font-mono">moov/udta/meta</span>
                <span className="text-muted-foreground">
                  {data.meta ? '✓ Found' : '✗ Not found'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${data.ilst ? 'bg-green-500' : 'bg-red-500'}`}
                />
                <span className="font-mono">moov/udta/meta/ilst</span>
                <span className="text-muted-foreground">
                  {data.ilst ? '✓ Found' : '✗ Not found'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* UDTA Box */}
          {data.udta ? (
            <Card>
              <CardHeader>
                <CardTitle>UDTA Box (User Data)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-muted p-4 rounded-lg space-y-1">
                    <div>
                      <strong>Type:</strong> {data.udta.type}
                    </div>
                    <div>
                      <strong>Size:</strong> {data.udta.size} bytes
                    </div>
                    {data.udta.boxes && (
                      <div>
                        <strong>Sub-boxes:</strong>{' '}
                        {data.udta.boxes.map((b: any) => b.type).join(', ')}
                      </div>
                    )}
                  </div>

                  {data.udta.boxes && data.udta.boxes.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2">UDTA Sub-boxes Detail:</h4>
                      <div className="space-y-2">
                        {data.udta.boxes.map((box: any, idx: number) => (
                          <div key={idx} className="bg-muted p-3 rounded-lg">
                            <div className="font-mono text-sm mb-2">
                              Type: <strong>{box.type}</strong> ({box.size} bytes)
                            </div>
                            {box.data && (
                              <div className="text-xs">
                                <div>Data length: {box.data.length} bytes</div>
                                <div className="mt-1">
                                  First 100 bytes (hex):{' '}
                                  {Array.from(box.data.slice(0, 100))
                                    .map((b: number) => b.toString(16).padStart(2, '0'))
                                    .join(' ')}
                                </div>
                                <div className="mt-1">
                                  As text (UTF-8):{' '}
                                  <span className="break-all">
                                    {new TextDecoder('utf-8', { fatal: false }).decode(
                                      box.data.slice(0, 200)
                                    )}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>UDTA Box (User Data)</CardTitle>
              </CardHeader>
              <CardContent>
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No UDTA Box</AlertTitle>
                  <AlertDescription>
                    This video does not have a udta (user data) box. iTunes metadata is stored in
                    moov/udta/meta/ilst, so without udta, there can be no iTunes-style metadata.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}

          {/* META Box */}
          {data.meta && (
            <Card>
              <CardHeader>
                <CardTitle>META Box</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-muted p-4 rounded-lg space-y-1">
                    <div>
                      <strong>Type:</strong> {data.meta.type}
                    </div>
                    <div>
                      <strong>Size:</strong> {data.meta.size} bytes
                    </div>
                    <div>
                      <strong>Has hdlr:</strong> {data.meta.hdlr ? 'Yes' : 'No'}
                    </div>
                    {data.meta.hdlr && (
                      <div>
                        <strong>Handler type:</strong> {data.meta.hdlr.handler}
                      </div>
                    )}
                    <div>
                      <strong>Has ilst:</strong> {data.meta.ilst ? 'Yes' : 'No'}
                    </div>
                    {data.meta.boxes && (
                      <div>
                        <strong>Sub-boxes:</strong>{' '}
                        {data.meta.boxes.map((b: any) => b.type).join(', ')}
                      </div>
                    )}
                  </div>

                  {!data.meta.ilst && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>No ILST Box</AlertTitle>
                      <AlertDescription>
                        The meta box exists but does not contain an ilst (iTunes metadata) box. This
                        video likely doesn't have iTunes-style metadata tags.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ILST Box (Raw) */}
          {data.ilst && (
            <Card>
              <CardHeader>
                <CardTitle>ILST Box (Raw iTunes Metadata)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Box Properties:</h4>
                    <div className="bg-muted p-4 rounded-lg space-y-1">
                      <div>
                        <strong>Type:</strong> {data.ilst.type}
                      </div>
                      <div>
                        <strong>Size:</strong> {data.ilst.size} bytes
                      </div>
                      <div>
                        <strong>Has list:</strong> {data.ilst.list ? 'Yes' : 'No'}
                      </div>
                      {data.ilst.list && (
                        <div>
                          <strong>Number of entries:</strong> {Object.keys(data.ilst.list).length}
                        </div>
                      )}
                    </div>
                  </div>

                  {data.ilst.list && (
                    <div>
                      <h4 className="font-semibold mb-2">Parsed List Entries:</h4>
                      <div className="space-y-2">
                        {Object.entries(data.ilst.list).map(([key, dataBox]: [string, any]) => {
                          // Convert numeric key to atom code
                          const numKey = parseInt(key, 10)
                          const bytes = [
                            (numKey >> 24) & 0xff,
                            (numKey >> 16) & 0xff,
                            (numKey >> 8) & 0xff,
                            numKey & 0xff,
                          ]
                          const atomCode = String.fromCharCode(...bytes)

                          return (
                            <div key={key} className="bg-muted p-3 rounded-lg">
                              <div className="font-mono text-sm mb-2">
                                Key: <strong>{key}</strong> → Atom: <strong>{atomCode}</strong>
                              </div>
                              <div className="text-sm mb-1">Value Type: {dataBox.valueType}</div>
                              {dataBox.value && (
                                <div className="text-sm">
                                  <strong>Value:</strong>
                                  <div className="mt-1 p-2 bg-background rounded">
                                    {dataBox.value.length > 200
                                      ? `${dataBox.value.substring(0, 200)}...`
                                      : dataBox.value}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ILST Parsed */}
          {data.ilstParsed && (
            <Card>
              <CardHeader>
                <CardTitle>ILST Parsed (Our Parser)</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
                  {safeStringify(data.ilstParsed)}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Full Box Tree */}
          <Card>
            <CardHeader>
              <CardTitle>META Box Structure</CardTitle>
            </CardHeader>
            <CardContent>
              <Alert className="mb-4">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  This shows the meta box structure. Look for the ilst box which contains iTunes
                  metadata.
                </AlertDescription>
              </Alert>
              {data.rawBoxTree ? (
                <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm max-h-[600px]">
                  {data.rawBoxTree}
                </pre>
              ) : (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No META Box</AlertTitle>
                  <AlertDescription>
                    This video does not have a meta box, so it cannot contain iTunes-style metadata.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* All Boxes */}
          <Card>
            <CardHeader>
              <CardTitle>All Top-Level Boxes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.boxes.map((box: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="font-mono bg-muted px-2 py-1 rounded">{box.type}</span>
                    <span className="text-sm text-muted-foreground">{box.size} bytes</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
