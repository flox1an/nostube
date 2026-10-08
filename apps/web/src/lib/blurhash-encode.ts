import { encode } from 'blurhash'

/**
 * Generate a blurhash string from an image blob.
 * Uses a small canvas (32x32) for fast encoding while maintaining quality.
 *
 * @param imageBlob - The image blob to encode
 * @returns Promise resolving to blurhash string, or undefined if encoding fails
 */
export async function generateBlurhash(imageBlob: Blob): Promise<string | undefined> {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(imageBlob)

    img.onload = () => {
      try {
        // Use small canvas for fast encoding
        const width = 32
        const height = 32

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          URL.revokeObjectURL(url)
          resolve(undefined)
          return
        }

        // Draw scaled image to canvas
        ctx.drawImage(img, 0, 0, width, height)

        // Get pixel data
        const imageData = ctx.getImageData(0, 0, width, height)

        // Encode blurhash with 4x3 components (good balance of detail vs size)
        const blurhash = encode(imageData.data, width, height, 4, 3)

        URL.revokeObjectURL(url)
        resolve(blurhash)
      } catch (error) {
        console.error('Failed to generate blurhash:', error)
        URL.revokeObjectURL(url)
        resolve(undefined)
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(undefined)
    }

    img.src = url
  })
}
