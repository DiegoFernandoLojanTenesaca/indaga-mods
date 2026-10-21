import { LAYOUT } from './layout'
import { PALETTE } from './palette'

const SVG = 'http://www.w3.org/2000/svg'

const escaped = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function bannerSvgOf(title: string, subtitle: string, accent: string) {
  const look = LAYOUT.banner
  const ink = PALETTE.bannerInk
  const stroke = `fill="none" stroke="${ink}" stroke-opacity="${look.fade}" stroke-width="${look.branchStroke}"`
  const dot = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="${look.branchRadius}" ${stroke}/>`
  const middleY = (look.branchTopY + look.branchBottomY) / 2
  const trunk = `<path d="M${look.branchLeftX} ${look.branchTopY + look.branchRadius} L${look.branchLeftX} ${look.branchBottomY - look.branchRadius}" ${stroke}/>`
  const merge = `<path d="M${look.branchRightX} ${look.branchTopY + look.branchRadius} C${look.branchRightX} ${middleY} ${look.branchLeftX} ${middleY} ${look.branchLeftX} ${look.branchBottomY - look.branchRadius}" ${stroke} stroke-linecap="round"/>`
  const branch = `${trunk}${merge}${dot(look.branchLeftX, look.branchTopY)}${dot(look.branchRightX, look.branchTopY)}${dot(look.branchLeftX, look.branchBottomY)}`
  const heading = `<text x="${look.titleX}" y="${look.titleY}" font-family="${look.font}" font-size="${look.titleSize}" font-weight="800" fill="${ink}">${escaped(title)}</text>`
  const lead = `<text x="${look.subtitleX}" y="${look.subtitleY}" font-family="${look.font}" font-size="${look.subtitleSize}" fill="${ink}" fill-opacity="${look.fade}">${escaped(subtitle)}</text>`
  return `<svg xmlns="${SVG}" width="${look.width}" height="${look.height}" viewBox="0 0 ${look.width} ${look.height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${PALETTE.bannerBase}"/></linearGradient></defs><rect width="${look.width}" height="${look.height}" rx="${look.corner}" fill="url(#g)"/>${branch}${heading}${lead}</svg>`
}
