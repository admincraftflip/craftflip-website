import sharp from 'sharp'

// Reader images uploaded by the owner: the logo and the background image. PNG, JPEG or WebP,
// identified by their first bytes (the file name and declared type are not trusted). SVG is not
// accepted, because it can carry scripts.
export const MAX_LOGO_BYTES = 2 * 1024 * 1024
export const MAX_BACKGROUND_BYTES = 8 * 1024 * 1024
const MAX_INPUT_PIXELS = 40_000_000
// Shown in a reader header, so it never needs to be larger than this.
const LOGO_BOX = { width: 640, height: 240 }
// Fills the reader around the pages (cropped to cover); large enough for a wide desktop screen.
const BACKGROUND_BOX = { width: 2560, height: 2560 }
// Below this average brightness (0-1) an image counts as dark.
const DARK_LUMINANCE = 0.5

export class LogoError extends Error {}

export function logoImageType(buffer) {
  if (!buffer || buffer.length < 12) return null
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg'
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp'
  return null
}

// Re-encodes the logo as WebP: this drops metadata and anything that is not image data, keeps
// transparency, fits it inside 640x240 and turns phone photos the right way up.
export async function processLogo(buffer) {
  try {
    const { data, info } = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ ...LOGO_BOX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer({ resolveWithObject: true })
    return { data, width: info.width, height: info.height }
  } catch {
    throw new LogoError("This image couldn't be read. Please upload a PNG, JPEG or WebP logo.")
  }
}

// Re-encodes a background image as WebP within 2560x2560 (metadata and anything that is not image
// data dropped, phone photos turned the right way up) and measures whether it is light or dark.
export async function processBackground(buffer) {
  try {
    const { data, info } = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ ...BACKGROUND_BOX, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .webp({ quality: 78 })
      .toBuffer({ resolveWithObject: true })
    const { channels } = await sharp(data).stats()
    const [red, green = red, blue = red] = channels.map((channel) => channel.mean / 255)
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
    return { data, width: info.width, height: info.height, tone: luminance < DARK_LUMINANCE ? 'dark' : 'light' }
  } catch {
    throw new LogoError("This image couldn't be read. Please upload a PNG, JPEG or WebP image.")
  }
}
