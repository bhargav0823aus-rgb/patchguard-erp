// Generates simple placeholder PWA icons (icon-192.png, icon-512.png) into public/.
// No external deps — builds a PNG with raw zlib + CRC.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')

function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
    crc32.table = table
  }
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

// Solid color square + a small circle in the center
function makePng(size, bg, fg) {
  const w = size
  const h = size
  // RGBA raw image data with PNG filter byte (0) per scanline
  const stride = 1 + w * 4
  const raw = Buffer.alloc(stride * h)
  const cx = w / 2
  const cy = h / 2
  const r = w * 0.32
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0 // filter type none
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const inside = dx * dx + dy * dy <= r * r
      const c = inside ? fg : bg
      const p = y * stride + 1 + x * 4
      raw[p] = c[0]
      raw[p + 1] = c[1]
      raw[p + 2] = c[2]
      raw[p + 3] = 255
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const idat = deflateSync(raw)
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

const bg = [11, 18, 32] // #0b1220
const fg = [31, 157, 85] // #1f9d55
writeFileSync(join(publicDir, 'icon-192.png'), makePng(192, bg, fg))
writeFileSync(join(publicDir, 'icon-512.png'), makePng(512, bg, fg))
console.log('Wrote icon-192.png and icon-512.png')
