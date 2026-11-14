// Rasterizes the terminal rendering's block grid and decodes it, to prove the ASCII QR scans.
import QRCode from 'qrcode'
import { PNG } from 'pngjs'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const ec = 'L'
const uri = process.argv[2] ?? (() => { throw new Error("usage: node verify-qr.mjs <nostrconnect-uri>") })()
const quiet = 2
const { modules } = QRCode.create(uri, { errorCorrectionLevel: ec })
const size = modules.size
const inCode = (r, c) => r >= 0 && r < size && c >= 0 && c < size && modules.get(r, c)
const lines = []
for (let row = -quiet; row < size + quiet; row += 2) {
  let line = ''
  for (let col = -quiet; col < size + quiet; col++) {
    const top = inCode(row, col), bottom = inCode(row + 1, col)
    line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : '\u00a0'
  }
  lines.push(line)
}
const px = 4, w = lines[0].length * px, h = lines.length * px * 2
const png = new PNG({ width: w, height: h })
png.data.fill(255)
const dark = (x, y) => { const i = (png.width * y + x) << 2; png.data[i] = png.data[i + 1] = png.data[i + 2] = 0 }
lines.forEach((line, li) => {
  ;[...line].forEach((ch, ci) => {
    for (let dy = 0; dy < px * 2; dy++) {
      const topHalf = dy < px
      const on = ch === '█' || (ch === '▀' && topHalf) || (ch === '▄' && !topHalf)
      if (!on) continue
      for (let dx = 0; dx < px; dx++) dark(ci * px + dx, li * px * 2 + dy)
    }
  })
})
writeFileSync('/tmp/ascii-qr.png', PNG.sync.write(png))
const out = execFileSync('zbarimg', ['-q', '--raw', '/tmp/ascii-qr.png'], { encoding: 'utf8' }).trim()
console.log(out === uri ? 'decode-ok' : `decode-mismatch: ${out.slice(0, 40)}`)
