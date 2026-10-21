import type { EngineInterface } from 'claude-code'

import type { MusicAlbum, MusicCue, MusicTrack } from '../types'

const AUDIO = /\.(mp3|flac|ogg|opus|m4a|wav)$/i
const SYNCED = /\.srt$/i
const PLAIN = /\.txt$/i
const IMAGE = /\.(png|jpe?g|webp)$/i
const COVER_NAME = /cover|folder|front|portada/i
const LINE_BREAK = /\r?\n/
const STAMP = /(\d+):(\d+):(\d+)[,.](\d+)\s*-->/
const MARKUP = /<[^>]*>|\{[^}]*\}/g
const NOTES = /^[\s♪♫]+|[\s♪♫]+$/g
const MUSIC_NOTE = '♪'
const STATUS = /(-?\d+(?:\.\d+)?)\s+[AMV]-[AV]:/g
const DURATION = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/
const NUMBERED = /^(\d+)\s*-\s*(.+)$/
const YOUTUBE_SEARCH = 'https://www.youtube.com/results?search_query='

type Slot = 'audio' | 'synced' | 'plain'

const slotOf = (name: string): Slot | undefined =>
  AUDIO.test(name) ? 'audio' : SYNCED.test(name) ? 'synced' : PLAIN.test(name) ? 'plain' : undefined

const isVisible = (name: string) => !name.startsWith('.')

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

export const joinPath = (dir: string, name: string) =>
  `${dir.replace(/[\\/]+$/, '')}${dir.includes('\\') ? '\\' : '/'}${name}`

export const nameOf = (path: string) => path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)

export function tracksOf(albumId: string, files: readonly string[]): MusicTrack[] {
  const found = new Map<string, Partial<Record<Slot, string>>>()
  for (const file of files) {
    const name = nameOf(file)
    const slot = slotOf(name)
    if (!slot) continue
    const stem = name.replace(/\.[^.]+$/, '')
    const entry = found.get(stem) ?? {}
    entry[slot] ??= file
    found.set(stem, entry)
  }
  return [...found]
    .flatMap(([title, entry]) =>
      entry.audio
        ? [{ id: entry.audio, album: albumId, title, audio: entry.audio, synced: entry.synced, plain: entry.plain }]
        : [],
    )
    .sort((a, b) => byName(a.title, b.title))
}

export function coverOf(files: readonly string[]) {
  const images = files.filter(file => IMAGE.test(nameOf(file))).sort(byName)
  return images.find(file => COVER_NAME.test(nameOf(file))) ?? images[0]
}

async function filesOf($: EngineInterface, dir: string) {
  const entries = await $.fs.list(dir)
  const own = entries.filter(entry => entry.kind === 'file').map(entry => joinPath(dir, entry.name))
  const nested = await Promise.all(
    entries
      .filter(entry => entry.kind === 'dir' && isVisible(entry.name))
      .map(async entry => {
        const inner = joinPath(dir, entry.name)
        const listed = await $.fs.list(inner).catch(() => [])
        return listed.filter(file => file.kind === 'file').map(file => joinPath(inner, file.name))
      }),
  )
  return { own, all: [...own, ...nested.flat()] }
}

export async function scanLibrary($: EngineInterface, root: string): Promise<MusicAlbum[]> {
  const folders = (await $.fs.list(root))
    .filter(entry => entry.kind === 'dir' && isVisible(entry.name))
    .map(entry => entry.name)
    .sort(byName)
  const albums = await Promise.all(
    folders.map(async (name): Promise<MusicAlbum> => {
      const id = joinPath(root, name)
      const { own, all } = await filesOf($, id)
      const cover = coverOf(own)
      const tracks = tracksOf(id, all).map(track => ({ ...track, cover }))
      return { id, name, source: 'local', tracks, isLoaded: true }
    }),
  )
  return albums.filter(album => album.tracks.length > 0)
}

const millisecondsOf = (hours: string, minutes: string, seconds: string) =>
  Math.round(((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000)

const blocksOf = (text: string) => text.trimStart().split(LINE_BREAK).join('\n').split(/\n\s*\n/)

export function parseSrt(text: string): MusicCue[] {
  return blocksOf(text)
    .flatMap(block => {
      const lines = block.split('\n')
      const at = lines.findIndex(line => STAMP.test(line))
      const stamp = at < 0 ? null : lines[at]!.match(STAMP)
      if (!stamp) return []
      const [, hours, minutes, seconds, fraction] = stamp as unknown as [string, string, string, string, string]
      const words = lines.slice(at + 1).join(' ').replace(MARKUP, '').replace(/\s+/g, ' ').trim()
      const sung = words.replace(NOTES, '')
      const startMs = millisecondsOf(hours, minutes, `${seconds}.${fraction.padEnd(3, '0').slice(0, 3)}`)
      return words ? [{ startMs, text: sung || MUSIC_NOTE }] : []
    })
    .sort((a, b) => a.startMs - b.startMs)
}

export function stanzasOf(text: string): string[] {
  return blocksOf(text)
    .map(stanza => stanza.trim())
    .filter(Boolean)
}

export function cueIndexAt(cues: readonly MusicCue[], positionMs: number) {
  let index = -1
  for (const [at, cue] of cues.entries()) {
    if (cue.startMs > positionMs) break
    index = at
  }
  return index
}

export function positionOf(status: string): number | undefined {
  const last = [...status.matchAll(STATUS)].at(-1)
  return last ? Math.round(Number(last[1]) * 1000) : undefined
}

export function durationOf(status: string): number | undefined {
  const found = status.match(DURATION) as [string, string, string, string] | null
  return found ? millisecondsOf(found[1], found[2], found[3]) : undefined
}

export function clockOf(positionMs: number) {
  const seconds = Math.max(0, Math.floor(positionMs / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function splitTitle(title: string) {
  const found = title.match(NUMBERED)
  return found ? { number: found[1]!, name: found[2]! } : { number: '', name: title }
}

export function hashOf(text: string) {
  let hash = 5381
  for (const char of text) hash = (Math.imul(hash, 33) ^ char.codePointAt(0)!) >>> 0
  return hash.toString(36)
}

export const youtubeUrlOf = (artist: string, title: string) =>
  `${YOUTUBE_SEARCH}${encodeURIComponent([artist.trim(), splitTitle(title).name].filter(Boolean).join(' '))}`
