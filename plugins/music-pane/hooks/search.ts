import type { MusicTrack } from '../types'

const SUGGEST_AT = 0.6

export type Searchable = {
  track: MusicTrack
  album: string
  artist: string
  lines: string[]
}

export type LocalSearch = {
  hits: MusicTrack[]
  suggestion?: { track: MusicTrack; line?: string }
}

const BRACKETED = /[([][^)\]]*[)\]]/g
const FEATURING = /\s(?:ft|feat|featuring)\b.*$/i
const NUMBERED = /^\d+\s*-\s*/

export const normalized = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

export function songKeyOf(title: string) {
  const bare = title.replace(BRACKETED, ' ').replace(NUMBERED, '').replace(FEATURING, '')
  const at = bare.lastIndexOf(' - ')
  return normalized(at < 0 ? bare : bare.slice(at + 3))
}

function bigramsOf(text: string) {
  const padded = ` ${text} `
  const grams = new Map<string, number>()
  for (let at = 0; at < padded.length - 1; at++) {
    const gram = padded.slice(at, at + 2)
    grams.set(gram, (grams.get(gram) ?? 0) + 1)
  }
  return grams
}

export function similarity(a: string, b: string) {
  if (!a || !b) return 0
  const left = bigramsOf(a)
  const right = bigramsOf(b)
  let shared = 0
  for (const [gram, count] of left) shared += Math.min(count, right.get(gram) ?? 0)
  const total = [...left.values(), ...right.values()].reduce((sum, count) => sum + count, 0)
  return (2 * shared) / total
}

export function closeness(query: string, text: string) {
  const words = text.split(' ')
  const size = query.split(' ').length
  if (words.length <= size) return similarity(query, text)
  let best = 0
  for (let at = 0; at + size <= words.length; at++) {
    best = Math.max(best, similarity(query, words.slice(at, at + size).join(' ')))
  }
  return best
}

export function searchLocal(query: string, items: readonly Searchable[]): LocalSearch {
  const wanted = normalized(query)
  if (!wanted) return { hits: [] }
  const hits = items
    .filter(item => [item.track.title, item.album, item.artist, ...item.lines].some(text => normalized(text).includes(wanted)))
    .map(item => item.track)
  if (hits.length > 0) return { hits }
  let best: { track: MusicTrack; line?: string; score: number } | undefined
  for (const item of items) {
    const byTitle = closeness(wanted, normalized(item.track.title))
    if (byTitle > (best?.score ?? 0)) best = { track: item.track, score: byTitle }
    for (const line of item.lines) {
      const byLine = closeness(wanted, normalized(line))
      if (byLine > (best?.score ?? 0)) best = { track: item.track, line, score: byLine }
    }
  }
  return best && best.score >= SUGGEST_AT ? { hits: [], suggestion: { track: best.track, line: best.line } } : { hits: [] }
}
