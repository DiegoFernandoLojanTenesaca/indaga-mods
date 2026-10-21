import { LAYOUT } from './layout'
import { PALETTE } from './palette'

const SVG = 'http://www.w3.org/2000/svg'

const fractionOf = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))

export const coverFilterOf = (width: number, height: number) =>
  `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`

export function coverSvgOf(base64: string) {
  const { coverWidth: width, coverHeight: height, coverCorner: corner } = LAYOUT
  return `<svg xmlns="${SVG}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><clipPath id="c"><rect width="${width}" height="${height}" rx="${corner}"/></clipPath><image href="data:image/jpeg;base64,${base64}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#c)"/></svg>`
}

export function progressSvgOf(fraction: number, accent: string) {
  const { barWidth: width, barHeight: height } = LAYOUT
  const done = Math.round(fractionOf(fraction) * width)
  return `<svg xmlns="${SVG}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" rx="${height / 2}" fill="${PALETTE.barTrack}"/><rect width="${done}" height="${height}" rx="${height / 2}" fill="${accent}"/></svg>`
}

const escaped = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function welcomeSvgOf(title: string, subtitle: string, accent: string) {
  const look = LAYOUT.welcome
  const ink = PALETTE.welcomeInk
  const columns = look.bars
    .map((level, index) => {
      const tall = Math.round(level * look.barReach)
      const x = look.width - look.barRight - (look.bars.length - index) * (look.barWidth + look.barGap)
      return `<rect x="${x}" y="${look.barBase - tall}" width="${look.barWidth}" height="${tall}" rx="${look.barWidth / 2}" fill="${ink}" fill-opacity="${look.fade}"/>`
    })
    .join('')
  const heading = `<text x="${look.titleX}" y="${look.titleY}" font-family="${look.font}" font-size="${look.titleSize}" font-weight="800" fill="${ink}">${escaped(title)}</text>`
  const lead = `<text x="${look.subtitleX}" y="${look.subtitleY}" font-family="${look.font}" font-size="${look.subtitleSize}" fill="${ink}" fill-opacity="${look.fade}">${escaped(subtitle)}</text>`
  return `<svg xmlns="${SVG}" width="${look.width}" height="${look.height}" viewBox="0 0 ${look.width} ${look.height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${PALETTE.welcomeBase}"/></linearGradient></defs><rect width="${look.width}" height="${look.height}" rx="${look.corner}" fill="url(#g)"/>${columns}${heading}${lead}</svg>`
}

export function progressTextOf(fraction: number, columns: number) {
  const done = Math.round(fractionOf(fraction) * columns)
  return { done: '━'.repeat(done), left: '─'.repeat(columns - done) }
}
