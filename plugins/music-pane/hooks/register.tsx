import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type {
  MusicAlbum,
  MusicBusy,
  MusicCover,
  MusicCue,
  MusicLyrics,
  MusicPlayback,
  MusicProblem,
  MusicSuggestion,
  MusicTrack,
} from '../types'
import { coverFilterOf, coverSvgOf, progressSvgOf, progressTextOf, welcomeSvgOf } from './art'
import { ICONS } from './icons'
import { LAYOUT } from './layout'
import {
  clockOf,
  complaintOf,
  cueIndexAt,
  hashOf,
  joinPath,
  nameOf,
  parseSrt,
  reportOf,
  scanLibrary,
  splitTitle,
  stanzasOf,
  youtubeUrlOf,
} from './library'
import { QUICK_PICKS, localeOf, translate } from './locales'
import type { Locale, MessageKey } from './locales'
import { DEFAULT_THEME, PALETTE, THEMES, isTheme } from './palette'
import type { ThemeName } from './palette'
import { searchLocal, songKeyOf } from './search'
import type { Searchable } from './search'
import {
  channelAlbumsOf,
  durationMsOf,
  isYoutubeLink,
  linkAlbumOf,
  listingAlbumOf,
  mixUrlOf,
  playlistsUrlOf,
  searchOf,
  subtitleUrlOf,
  videoIdOf,
  youtubeTracksOf,
} from './youtube'
import type { YoutubeListing, YoutubeVideo } from './youtube'

const PANE = 'music-pane'
const COMMAND = 'music'
const OPEN_TOOL = 'open'
const OPEN_CALLED = 'mcp__music-pane__open'
const OPEN_DESCRIPTION =
  'Opens the music player pane beside the chat, where the person searches, picks and plays songs. Call it when they ask to see the music player.'
const PLAY_TOOL = 'play'
const PLAY_CALLED = 'mcp__music-pane__play'
const PLAY_DESCRIPTION =
  'Plays music in the player beside the chat: searches the local library (titles, singers and lyrics) and YouTube for the query and plays the best match; similar songs follow it. Call it when the person asks to play or put on a song, a singer, a genre, a mood or a line of lyrics.'
const PLAY_SCHEMA = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'What to play: a title, a singer, a genre or mood, a line of the lyrics, or a YouTube link.',
    },
  },
  required: ['query'],
}
const DEFAULTS = { player: 'mpv', ffmpeg: 'ffmpeg', ytdlp: 'yt-dlp' }
const YTDLP_TIMEOUT_MS = 90_000
const FFMPEG_TIMEOUT_MS = 30_000
const PLAYED_LIMIT = 200
const RADIO_SIZE = 25
const END_SLACK_MS = 5_000
const MAX_RETRIES = 2
const HEARD_LIMIT = 4_000
const VOLUME = { step: 10, least: 0, most: 100, initial: 100 }
const RECONNECT = '--stream-lavf-o=reconnect=1,reconnect_streamed=1,reconnect_on_network_error=1,reconnect_delay_max=5'
const PLAYER_SCRIPT = ['player', 'control.lua']
const CONTROL_FILE = 'music-pane-control.json'
const STORE = { theme: 'theme', volume: 'volume', history: 'history' }
const HISTORY = 'history'
const COVER_PREFIX = `music-pane-cover-${LAYOUT.coverWidth}x${LAYOUT.coverHeight}-`
const BROWSABLE = new Set<MusicAlbum['source']>(['local', 'channel', 'link'])
const KEPT = new Set<MusicAlbum['source']>(['link', 'search', 'radio', 'history'])
const ONE_OFF = new Set<MusicAlbum['source']>(['search', 'history'])

const albums = atom({ plugin: 'music-pane', key: 'albums' } as const, [] as MusicAlbum[])
const album = atom({ plugin: 'music-pane', key: 'album' } as const, '')
const playback = atom({ plugin: 'music-pane', key: 'playback' } as const, null as MusicPlayback | null)
const lyrics = atom({ plugin: 'music-pane', key: 'lyrics' } as const, null as MusicLyrics | null)
const cover = atom({ plugin: 'music-pane', key: 'cover' } as const, null as MusicCover | null)
const busy = atom({ plugin: 'music-pane', key: 'busy' } as const, null as MusicBusy | null)
const problem = atom({ plugin: 'music-pane', key: 'problem' } as const, null as MusicProblem | null)
const suggestion = atom({ plugin: 'music-pane', key: 'suggestion' } as const, null as MusicSuggestion | null)
const results = atom({ plugin: 'music-pane', key: 'results' } as const, null as string | null)
const isRadio = atom({ plugin: 'music-pane', key: 'isRadio' } as const, true)
const played = atom({ plugin: 'music-pane', key: 'played' } as const, [] as string[])
const theme = atom({ plugin: 'music-pane', key: 'theme' } as const, DEFAULT_THEME as string)
const volume = atom({ plugin: 'music-pane', key: 'volume' } as const, VOLUME.initial)
const history = atom({ plugin: 'music-pane', key: 'history' } as const, [] as MusicTrack[])

type Config = { library: string; artist: string; channel: string; player: string; ffmpeg: string; ytdlp: string }

type Ready = { source: string; sung: MusicLyrics; durationMs?: number }

let generation = 0
let live: number | undefined
let wantedCover: string | undefined
let locale: Promise<Locale> | undefined
const lineCache = new Map<string, string[]>()

const textOption = (value: unknown, fallback = '') => (typeof value === 'string' && value.trim() ? value.trim() : fallback)

const isBrowsable = (one: MusicAlbum) => BROWSABLE.has(one.source)

const isStream = (source: string) => /^https?:\/\//.test(source)

const volumeOf = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(VOLUME.most, Math.max(VOLUME.least, Math.round(value))) : undefined

export const configOf = (options: Record<string, unknown>): Config => ({
  library: textOption(options.library),
  artist: textOption(options.artist),
  channel: textOption(options.channel),
  player: textOption(options.player, DEFAULTS.player),
  ffmpeg: textOption(options.ffmpeg, DEFAULTS.ffmpeg),
  ytdlp: textOption(options.ytdlp, DEFAULTS.ytdlp),
})

export type PlayerRun = { source: string; fromMs: number; level: number; script: string; control: string; run: number }

export const playerArgs = ({ source, fromMs, level, script, control, run }: PlayerRun) => [
  '--no-video',
  '--no-config',
  '--quiet',
  '--msg-level=all=warn',
  '--idle=no',
  ...(isStream(source) ? [RECONNECT] : []),
  `--volume=${level}`,
  `--start=${(fromMs / 1000).toFixed(3)}`,
  `--script=${script}`,
  `--script-opts=music-pane-control=${control},music-pane-run=${run}`,
  source,
]

function localeFor($: EngineInterface) {
  locale ??= $.settings.read({ key: 'language' }).then(
    language => localeOf(typeof language === 'string' ? language : undefined),
    () => localeOf(undefined),
  )
  return locale
}

async function openPane($: EngineInterface) {
  const current = await localeFor($)
  await $.ui.open({ id: PANE, title: translate(current, 'title') })
  return translate(current, 'commandOpened')
}

async function runJson<T>($: EngineInterface, argv: string[]): Promise<T> {
  const out = await $.process.run(argv, { timeoutMs: YTDLP_TIMEOUT_MS }).catch(async (error: unknown) => {
    await setProblem($, { key: 'toolUnavailable', values: { tool: nameOf(argv[0] ?? '') } })
    throw error
  })
  if (out.exitCode !== 0) throw new Error(out.stderr)
  return JSON.parse(out.stdout) as T
}

async function setProblem($: EngineInterface, next: MusicProblem | null) {
  await update($, problem, () => next)
}

async function raiseProblem($: EngineInterface, next: MusicProblem) {
  await update($, problem, current => (current?.key === 'toolUnavailable' ? current : next))
}

async function setBusy($: EngineInterface, next: MusicBusy | null) {
  await update($, busy, () => next)
}

async function loadMemory($: EngineInterface) {
  const [savedTheme, savedVolume, savedHistory] = await Promise.all([
    $.store.get(STORE.theme),
    $.store.get(STORE.volume),
    $.store.get(STORE.history),
  ])
  if (isTheme(savedTheme)) await update($, theme, () => savedTheme)
  const level = volumeOf(savedVolume)
  if (level !== undefined) await update($, volume, () => level)
  if (Array.isArray(savedHistory)) await update($, history, () => savedHistory as MusicTrack[])
}

async function loadShelf($: EngineInterface, config: Config) {
  await setProblem($, null)
  const [local, channel] = await Promise.all([
    config.library ? scanLibrary($, config.library).catch(() => undefined) : [],
    config.channel
      ? runJson<YoutubeListing>($, [config.ytdlp, '--flat-playlist', '-J', playlistsUrlOf(config.channel)]).then(
          channelAlbumsOf,
          () => [],
        )
      : [],
  ])
  await update($, albums, current => [
    ...(local ?? []),
    ...channel.map(one => current.find(known => known.id === one.id && known.isLoaded) ?? one),
    ...current.filter(known => KEPT.has(known.source)),
  ])
  const shelf = (await read($, albums)).filter(isBrowsable)
  await update($, album, current => (shelf.some(one => one.id === current) ? current : (shelf[0]?.id ?? '')))
  if (local === undefined) await raiseProblem($, { key: 'libraryMissing', values: { path: config.library } })
  await loadAlbum($, config, await read($, album))
}

async function loadAlbum($: EngineInterface, config: Config, albumId: string) {
  const target = (await read($, albums)).find(one => one.id === albumId)
  if (!target?.url || target.isLoaded) return
  await setBusy($, 'album')
  const listing = await runJson<YoutubeListing>($, [config.ytdlp, '--flat-playlist', '-J', target.url]).catch(() => undefined)
  await setBusy($, null)
  if (!listing) return raiseProblem($, { key: 'youtubeFailed', values: { url: target.url } })
  const tracks = youtubeTracksOf(albumId, listing, config.artist)
  await update($, albums, current => current.map(one => (one.id === albumId ? { ...one, tracks, isLoaded: true } : one)))
}

async function chooseAlbum($: EngineInterface, config: Config, albumId: string) {
  await update($, album, () => albumId)
  await loadAlbum($, config, albumId)
}

async function shelve($: EngineInterface, added: MusicAlbum, replaces: (one: MusicAlbum) => boolean) {
  await update($, albums, current => [...current.filter(one => one.id !== added.id && !replaces(one)), added])
}

async function addLink($: EngineInterface, config: Config, link: string) {
  await setBusy($, 'search')
  const listing = await runJson<YoutubeListing>($, [config.ytdlp, '--flat-playlist', '-J', link]).catch(() => undefined)
  await setBusy($, null)
  if (!listing) {
    await raiseProblem($, { key: 'youtubeFailed', values: { url: link } })
    return undefined
  }
  const added = linkAlbumOf(link, listing, config.artist)
  await shelve($, added, () => false)
  await update($, album, () => added.id)
  await update($, results, () => added.id)
  return added.tracks[0]
}

async function readText($: EngineInterface, path: string | undefined) {
  return path ? $.fs.read(path).catch(() => '') : ''
}

async function linesOf($: EngineInterface, track: MusicTrack) {
  const path = track.synced ?? track.plain
  if (!path) return []
  const known = lineCache.get(path)
  if (known) return known
  const text = await readText($, path)
  const lines = track.synced ? parseSrt(text).map(cue => cue.text) : stanzasOf(text).flatMap(stanza => stanza.split('\n'))
  lineCache.set(path, lines)
  return lines
}

async function closeResults($: EngineInterface) {
  await update($, results, () => null)
  await update($, suggestion, () => null)
}

async function search($: EngineInterface, config: Config, query: string): Promise<MusicTrack | undefined> {
  const wanted = query.trim()
  if (!wanted) return undefined
  await closeResults($)
  await setProblem($, null)
  if (isYoutubeLink(wanted)) return addLink($, config, wanted)
  await setBusy($, 'search')
  const shelf = await read($, albums)
  const items: Searchable[] = await Promise.all(
    shelf
      .filter(one => one.source === 'local')
      .flatMap(one => one.tracks.map(async track => ({ track, album: one.name, artist: config.artist, lines: await linesOf($, track) }))),
  )
  const local = searchLocal(wanted, items)
  const online = await runJson<YoutubeListing>($, [config.ytdlp, '--flat-playlist', '-J', searchOf(wanted)]).catch(() => undefined)
  await setBusy($, null)
  await update($, suggestion, () => local.suggestion ?? null)
  const id = `search:${wanted}`
  const homeOf = (track: MusicTrack) => shelf.find(one => one.id === track.album)?.name
  const tracks = [
    ...local.hits.map(track => ({ ...track, album: id, byline: homeOf(track) })),
    ...(online ? youtubeTracksOf(id, online, config.artist) : []),
  ]
  if (tracks.length === 0) {
    await raiseProblem($, { key: 'nothingFound', values: { query: wanted } })
    return local.suggestion?.track
  }
  await shelve($, listingAlbumOf(id, wanted, 'search', tracks), one => one.source === 'search')
  await update($, results, () => id)
  return tracks[0]
}

async function seedOf($: EngineInterface, config: Config, track: MusicTrack) {
  const own = track.page ? videoIdOf(track.page) : undefined
  if (own) return own
  const query = [config.artist, splitTitle(track.title).name].filter(Boolean).join(' ')
  const found = await runJson<YoutubeListing>($, [config.ytdlp, '--flat-playlist', '-J', searchOf(query, 1)]).catch(() => undefined)
  return found?.entries?.[0]?.id
}

async function startRadio($: EngineInterface, config: Config, track: MusicTrack) {
  await setBusy($, 'radio')
  const seed = await seedOf($, config, track)
  const listing = seed
    ? await runJson<YoutubeListing>($, [config.ytdlp, '--flat-playlist', '--playlist-end', String(RADIO_SIZE), '-J', mixUrlOf(seed)]).catch(
        () => undefined,
      )
    : undefined
  await setBusy($, null)
  if (!seed || !listing) return false
  const seen = new Set([...(await read($, played)), songKeyOf(track.title)])
  const id = `radio:${seed}`
  const tracks = youtubeTracksOf(id, listing, config.artist).filter(one => {
    const key = songKeyOf(one.title)
    if (seen.has(key) || videoIdOf(one.id) === seed) return false
    seen.add(key)
    return true
  })
  if (tracks.length === 0) return false
  await shelve($, listingAlbumOf(id, splitTitle(track.title).name, 'radio', tracks), one => one.source === 'radio')
  await play($, config, tracks[0]!)
  return true
}

async function prepareLocal($: EngineInterface, track: MusicTrack, audio: string): Promise<Ready> {
  const [synced, plain] = await Promise.all([readText($, track.synced), readText($, track.plain)])
  return { source: audio, sung: { trackId: track.id, cues: parseSrt(synced), stanzas: stanzasOf(plain) } }
}

async function prepareVideo($: EngineInterface, config: Config, track: MusicTrack, page: string): Promise<Ready> {
  const video = await runJson<YoutubeVideo>($, [config.ytdlp, '-f', 'bestaudio', '--no-playlist', '-J', page])
  if (!video.url) throw new Error(page)
  const subtitle = subtitleUrlOf(video, await localeFor($))
  const synced = subtitle ? await $.http.fetch(subtitle).then(answer => (answer.ok ? answer.text : ''), () => '') : ''
  return {
    source: video.url,
    sung: { trackId: track.id, cues: parseSrt(synced), stanzas: [] },
    durationMs: durationMsOf(video.duration),
  }
}

async function prepare($: EngineInterface, config: Config, track: MusicTrack) {
  if (track.audio) return prepareLocal($, track, track.audio)
  if (track.page) return prepareVideo($, config, track, track.page)
  throw new Error(track.id)
}

async function tempFolderOf($: EngineInterface) {
  return (await $.env.get('TEMP')) ?? (await $.env.get('TMPDIR')) ?? '/tmp'
}

async function loadCover($: EngineInterface, config: Config, source: string | undefined) {
  wantedCover = source
  if (!source || (await read($, cover))?.source === source) return
  const target = joinPath(await tempFolderOf($), `${COVER_PREFIX}${hashOf(source)}.jpg`)
  if (!(await $.fs.exists(target))) {
    const filter = coverFilterOf(LAYOUT.coverWidth, LAYOUT.coverHeight)
    const argv = [config.ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-vf', filter, '-frames:v', '1', target]
    const made = await $.process.run(argv, { timeoutMs: FFMPEG_TIMEOUT_MS })
    if (made.exitCode !== 0) return
  }
  const { base64 } = await $.fs.read(target, { as: 'bytes' })
  if (wantedCover === source) await update($, cover, () => ({ source, data: base64 }))
}

async function remember($: EngineInterface, track: MusicTrack) {
  const key = songKeyOf(track.title)
  const kept = (await read($, history)).filter(one => songKeyOf(one.title) !== key)
  const next = [{ ...track, album: HISTORY }, ...kept].slice(0, LAYOUT.recentSize)
  await update($, history, () => next)
  await $.store.set(STORE.history, next)
}

async function fail($: EngineInterface, run: number, reason: MusicProblem) {
  if (run !== generation) return
  await update($, playback, () => null)
  await raiseProblem($, reason)
}

async function stop($: EngineInterface) {
  generation++
  await update($, playback, () => null)
}

async function controlPathOf($: EngineInterface) {
  return joinPath(await tempFolderOf($), CONTROL_FILE)
}

async function steer($: EngineInterface, run: number, isPaused: boolean) {
  await $.fs.write(await controlPathOf($), JSON.stringify({ run, volume: await read($, volume), pause: isPaused }))
}

async function listen(
  $: EngineInterface,
  config: Config,
  track: MusicTrack,
  ready: Ready,
  fromMs: number,
  run: number,
  attempt: number,
) {
  const cues: MusicCue[] = ready.sung.cues
  const control = await controlPathOf($)
  const level = await read($, volume)
  const script = PLAYER_SCRIPT.reduce(joinPath, $.plugin.root)
  await steer($, run, false)
  let shown = ''
  let lastMs = fromMs
  let lengthMs = ready.durationMs
  let hasPlayed = false
  let hasStarted = false
  let heard = ''
  const argv = [config.player, ...playerArgs({ source: ready.source, fromMs, level, script, control, run })]
  live = run
  try {
    for await (const piece of $.process.spawn({ argv })) {
      hasStarted = true
      if (run !== generation) return
      if (!hasPlayed && heard.length < HEARD_LIMIT) heard += piece.text
      const report = reportOf(piece.text)
      const durationMs = report.lengthMs
      if (durationMs !== undefined && durationMs !== lengthMs) {
        lengthMs = durationMs
        await update($, playback, current => (current?.trackId === track.id ? { ...current, durationMs } : current))
      }
      const positionMs = report.positionMs
      if (positionMs === undefined) continue
      hasPlayed = true
      lastMs = positionMs
      const mark = `${Math.floor(positionMs / 1000)}:${cueIndexAt(cues, positionMs)}`
      if (mark === shown) continue
      shown = mark
      await update($, playback, current => (current?.trackId === track.id ? { ...current, positionMs } : current))
    }
  } catch (error) {
    if (hasStarted) throw error
    return fail($, run, { key: 'toolUnavailable', values: { tool: nameOf(config.player) } })
  } finally {
    if (live === run) live = undefined
  }
  if (run !== generation) return
  const player = nameOf(config.player)
  if (!hasPlayed && isStream(ready.source) && attempt < MAX_RETRIES) return play($, config, track, fromMs, undefined, attempt + 1)
  const reason = complaintOf(heard)
  if (!hasPlayed && reason) return fail($, run, { key: 'playerFailedReason', values: { player, title: track.title, reason } })
  if (!hasPlayed) return fail($, run, { key: 'playerFailed', values: { player, title: track.title } })
  const isCut = lengthMs !== undefined && lastMs < lengthMs - END_SLACK_MS
  if (isCut && attempt < MAX_RETRIES) return play($, config, track, lastMs, undefined, attempt + 1)
  await skipFrom($, config, track, 1)
}

async function play($: EngineInterface, config: Config, track: MusicTrack, fromMs = 0, known?: string, attempt = 0) {
  const run = ++generation
  await setProblem($, null)
  await update($, playback, current => ({
    albumId: track.album,
    trackId: track.id,
    positionMs: fromMs,
    durationMs: current?.trackId === track.id ? current.durationMs : track.durationMs,
    source: known,
    isPlaying: true,
    isLoading: true,
  }))
  const key = songKeyOf(track.title)
  await update($, played, list => [...list.filter(one => one !== key), key].slice(-PLAYED_LIMIT))
  void loadCover($, config, track.cover).catch(() => {})
  const cached = await read($, lyrics)
  const ready =
    known && cached?.trackId === track.id
      ? { source: known, sung: cached }
      : await prepare($, config, track).catch(() => undefined)
  if (run !== generation) return
  if (!ready) return fail($, run, { key: 'youtubeFailed', values: { url: track.page ?? track.id } })
  if (ready.sung !== cached) await update($, lyrics, () => ready.sung)
  await update($, playback, current =>
    current?.trackId === track.id
      ? { ...current, source: ready.source, durationMs: current.durationMs ?? ready.durationMs, isLoading: false }
      : current,
  )
  if (!known && attempt === 0) void remember($, track).catch(() => {})
  void listen($, config, track, ready, fromMs, run, attempt)
    .catch(() => fail($, run, { key: 'playerFailed', values: { player: config.player, title: track.title } }))
    .catch(() => {})
}

async function pick($: EngineInterface, config: Config, track: MusicTrack) {
  await closeResults($)
  await play($, config, track)
}

async function playRecent($: EngineInterface, config: Config, track: MusicTrack) {
  const recent = await read($, history)
  await shelve($, listingAlbumOf(HISTORY, '', 'history', recent), one => one.source === 'history')
  await pick($, config, { ...track, album: HISTORY })
}

async function currentTrack($: EngineInterface) {
  const current = await read($, playback)
  const home = current ? (await read($, albums)).find(one => one.id === current.albumId) : undefined
  const track = home?.tracks.find(one => one.id === current?.trackId)
  return current && track ? { current, track } : undefined
}

async function skipFrom($: EngineInterface, config: Config, track: MusicTrack, step: number) {
  const home = (await read($, albums)).find(one => one.id === track.album)
  const follows = await read($, isRadio)
  const isOneOff = home !== undefined && ONE_OFF.has(home.source) && follows && step > 0
  const list = isOneOff ? [] : (home?.tracks ?? [])
  const target = list[Math.max(0, list.findIndex(one => one.id === track.id) + step)]
  if (target) return play($, config, target)
  if (step > 0 && follows && (await startRadio($, config, track))) return
  await stop($)
}

async function skip($: EngineInterface, config: Config, step: number) {
  const now = await currentTrack($)
  if (now) await skipFrom($, config, now.track, step)
}

async function toggle($: EngineInterface, config: Config) {
  const now = await currentTrack($)
  if (!now || now.current.isLoading) return
  if (live === generation) {
    const isPaused = now.current.isPlaying
    await steer($, generation, isPaused)
    await update($, playback, current => current && { ...current, isPlaying: !isPaused })
    return
  }
  if (!now.current.isPlaying) await play($, config, now.track, now.current.positionMs, now.current.source)
}

async function setVolume($: EngineInterface, wanted: number, isKept: boolean) {
  const level = volumeOf(wanted) ?? VOLUME.initial
  if (level !== (await read($, volume))) {
    await update($, volume, () => level)
    const current = await read($, playback)
    if (live === generation && current) await steer($, generation, !current.isPlaying)
  }
  if (isKept) await $.store.set(STORE.volume, level)
}

async function changeVolume($: EngineInterface, step: number) {
  await setVolume($, (await read($, volume)) + step, true)
}

async function chooseTheme($: EngineInterface, name: string) {
  if (!isTheme(name)) return
  await update($, theme, () => name)
  await $.store.set(STORE.theme, name)
}

async function toggleRadio($: EngineInterface) {
  await update($, isRadio, value => !value)
}

export const register: Register = (on, options) => {
  const config = configOf(options)
  const openOnStart = options.openOnStart !== false
  locale = undefined

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await update($, playback, current => (current?.albumId ? { ...current, isPlaying: false, isLoading: false } : null))
    await setBusy($, null)
    await update($, suggestion, () => null)
    const current = await localeFor($)
    await $.command.register({ name: COMMAND, description: translate(current, 'commandDescription') }).catch(() => {})
    await $.tool.register({ name: OPEN_TOOL, description: OPEN_DESCRIPTION }).catch(() => {})
    await $.tool.register({ name: PLAY_TOOL, description: PLAY_DESCRIPTION, inputSchema: PLAY_SCHEMA }).catch(() => {})
    await loadMemory($).catch(() => {})
    void loadShelf($, config).catch(() => {})
    if (openOnStart) void openPane($).catch(() => {})
    return started
  })

  on('session.end', async ($, e, next) => {
    generation++
    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    void loadShelf($, config).catch(() => {})
    return { text: await openPane($) }
  })

  on('tool.call', { tool: OPEN_CALLED }, async $ => {
    void loadShelf($, config).catch(() => {})
    return { result: await openPane($) }
  })

  on('tool.call', { tool: PLAY_CALLED }, async ($, e) => {
    void openPane($).catch(() => {})
    const current = await localeFor($)
    const chosen = await search($, config, e.query)
    if (!chosen) return { result: translate(current, 'nothingFound', { query: e.query }) }
    void pick($, config, chosen).catch(() => {})
    return { result: translate(current, 'toolPlaying', { title: splitTitle(chosen.title).name }) }
  })

  on('ui.message', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const sent = e.data as { volume?: unknown; isDone?: unknown } | null
    if (typeof sent?.volume === 'number') await setVolume($, sent.volume, sent.isDone === true)
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Link, Text } = $.ui.resolve(e)
    const current = await localeFor($)
    const t = (key: MessageKey, values?: Record<string, string>) => translate(current, key, values)
    const heading = (key: MessageKey, values?: Record<string, string>) => (
      <Text bold dimColor>
        {t(key, values).toLocaleUpperCase(current)}
      </Text>
    )
    const [all, chosen, now, sung, art, loading, issue, offer, found, follows, painted, level, recent] = await Promise.all([
      read($, albums),
      read($, album),
      read($, playback),
      read($, lyrics),
      read($, cover),
      read($, busy),
      read($, problem),
      read($, suggestion),
      read($, results),
      read($, isRadio),
      read($, theme),
      read($, volume),
      read($, history),
    ])
    const themeName = isTheme(painted) ? painted : DEFAULT_THEME
    const accent = THEMES[themeName]
    const shelf = all.filter(isBrowsable)
    const shown = shelf.find(one => one.id === chosen) ?? shelf[0]
    const listed = found ? all.find(one => one.id === found) : undefined
    const playing = now ? all.find(one => one.id === now.albumId) : undefined
    const track = now ? playing?.tracks.find(one => one.id === now.trackId) : undefined
    const isHome = !track && !listed
    const at = track && playing ? playing.tracks.indexOf(track) : -1
    const isOneOff = playing !== undefined && ONE_OFF.has(playing.source) && follows
    const upcoming = playing && !isOneOff ? playing.tracks.slice(at + 1, at + 1 + LAYOUT.queueSize) : []
    const hasMore = playing && !isOneOff && at + 1 + LAYOUT.queueSize < playing.tracks.length
    const fraction = now?.durationMs ? now.positionMs / now.durationMs : 0
    const elapsed = now ? clockOf(now.positionMs) : ''
    const total = now?.durationMs ? clockOf(now.durationMs) : t('unknownTime')
    const albumLabel = (one: MusicAlbum) =>
      one.source === 'channel' || one.source === 'link'
        ? t('youtubeAlbum', { name: one.name })
        : one.source === 'radio'
          ? t('radioAlbum', { name: one.name })
          : one.source === 'history'
            ? t('recentAlbum')
            : one.name
    const subLine = () => {
      const from = playing && playing.source !== 'search' ? albumLabel(playing) : undefined
      return track?.byline && from ? t('subLine', { byline: track.byline, album: from }) : (track?.byline ?? from ?? '')
    }
    const link = track ? (track.page ?? youtubeUrlOf(config.artist, track.title)) : undefined

    const artwork = () => {
      if (e.surface === 'terminal') {
        const bar = progressTextOf(fraction, LAYOUT.barColumns)
        return {
          welcome: (
            <Box flexDirection="column">
              <Text bold color={accent}>
                {t('title')}
              </Text>
              <Text dimColor>{t('welcomeSubtitle')}</Text>
            </Box>
          ),
          cover: null,
          progress: (
            <Text>
              <Text color={accent}>{bar.done}</Text>
              <Text dimColor>{bar.left}</Text>
            </Text>
          ),
        }
      }
      const { Svg } = $.ui.resolve(e)
      const hasCover = art && track && art.source === track.cover
      return {
        welcome: <Svg source={welcomeSvgOf(t('title'), t('welcomeSubtitle'), accent)} alt={t('title')} />,
        cover: hasCover ? <Svg source={coverSvgOf(art.data)} alt={t('cover', { album: playing?.name ?? '' })} /> : null,
        progress: <Svg source={progressSvgOf(fraction, accent)} alt={t('progress', { elapsed, total })} />,
      }
    }

    const volumeControl = () => {
      if (e.surface === 'terminal' || e.surface === 'desktop') {
        const { Client } = $.ui.resolve(e)
        const slider = {
          level,
          least: VOLUME.least,
          most: VOLUME.most,
          accent,
          filled: ICONS.sliderFilled,
          knob: ICONS.sliderKnob,
          empty: ICONS.sliderEmpty,
        }
        return <Client key="volume" module="./slider.tsx" width={LAYOUT.sliderColumns} props={slider} />
      }
      return (
        <Box flexDirection="row" gap={LAYOUT.buttonGap}>
          <Button key="quieter" label={ICONS.quieter} onPress={() => changeVolume($, -VOLUME.step)} />
          <Button key="louder" label={ICONS.louder} onPress={() => changeVolume($, VOLUME.step)} />
        </Box>
      )
    }

    const searchField = () => {
      if (e.surface === 'mobile') return null
      const { Input } = $.ui.resolve(e)
      return (
        <Input
          key="search"
          label={t('searchLabel')}
          placeholder={t('searchPlaceholder')}
          submitLabel={t('searchSubmit')}
          onSubmit={value => void search($, config, value)}
        />
      )
    }

    const albumChoice = () => {
      if (shelf.length < 2 || !shown) return null
      if (e.surface === 'mobile') {
        return (
          <Box flexDirection="row" flexWrap="wrap" gap={LAYOUT.buttonGap}>
            {shelf.map(one => (
              <Button
                key={`album:${one.id}`}
                label={albumLabel(one)}
                variant={one.id === shown.id ? 'primary' : 'secondary'}
                onPress={() => chooseAlbum($, config, one.id)}
              />
            ))}
          </Box>
        )
      }
      const { Select } = $.ui.resolve(e)
      return (
        <Select
          key="album"
          label={t('album')}
          value={shown.id}
          options={shelf.map(one => ({ value: one.id, label: albumLabel(one) }))}
          onSelect={value => void chooseAlbum($, config, value)}
        />
      )
    }

    const lyricLines = () => {
      if (!now || sung?.trackId !== now.trackId) return []
      if (sung.cues.length > 0) {
        const line = cueIndexAt(sung.cues, now.positionMs)
        const from = Math.max(0, line - LAYOUT.linesBefore)
        return sung.cues
          .slice(from, Math.max(line, 0) + LAYOUT.linesAfter + 1)
          .map((cue, offset) =>
            from + offset === line ? (
              <Text bold color={accent}>
                {cue.text}
              </Text>
            ) : (
              <Text dimColor>{cue.text}</Text>
            ),
          )
      }
      if (sung.stanzas.length > 0) return sung.stanzas.map(stanza => <Text dimColor>{stanza}</Text>)
      return [<Text dimColor>{t('noLyrics')}</Text>]
    }

    const row = (place: string, one: MusicTrack, number: string, onPress: () => void) => {
      const details = [one.byline, one.durationMs ? clockOf(one.durationMs) : undefined].filter(Boolean).join(' · ')
      const isCurrent = one.id === track?.id && one.album === now?.albumId
      const name = splitTitle(one.title).name
      return (
        <Button key={`${place}:${one.album}|${one.id}`} plain onPress={onPress}>
          {isCurrent ? <Text color={accent}>{`${ICONS.playing}  `}</Text> : <Text dimColor>{`${number}  `}</Text>}
          {isCurrent ? (
            <Text bold color={accent}>
              {name}
            </Text>
          ) : (
            <Text>{name}</Text>
          )}
          <Text dimColor>{details ? `   ${details}` : ''}</Text>
        </Button>
      )
    }

    const offerLabel = offer
      ? offer.line
        ? t('didYouMeanLine', { line: offer.line, title: splitTitle(offer.track.title).name })
        : t('didYouMean', { title: splitTitle(offer.track.title).name })
      : ''
    const { welcome, cover: coverArt, progress } = artwork()

    return (
      <Box flexDirection="column" gap={LAYOUT.sectionGap}>
        {isHome && welcome}
        {searchField()}
        {loading === 'search' && <Text dimColor>{t('loading')}</Text>}
        {offer && (
          <Button key="suggestion" plain onPress={() => pick($, config, offer.track)}>
            <Text color={accent}>{offerLabel}</Text>
          </Button>
        )}
        {issue && <Text color={PALETTE.problem}>{t(issue.key, issue.values)}</Text>}
        {isHome && (
          <Box flexDirection="column">
            {heading('quickHeading')}
            <Box flexDirection="row" flexWrap="wrap" gap={LAYOUT.buttonGap}>
              {QUICK_PICKS[current].map(query => (
                <Button key={`quick:${query}`} label={query} onPress={() => search($, config, query)} />
              ))}
            </Box>
          </Box>
        )}
        {isHome && recent.length > 0 && (
          <Box flexDirection="column">
            {heading('recentHeading')}
            {recent.map((one, index) => row('recent', one, String(index + 1), () => void playRecent($, config, one)))}
          </Box>
        )}
        {listed && (
          <Box flexDirection="column">
            <Box flexDirection="row" justifyContent="space-between">
              {heading('resultsHeading', { query: listed.name })}
              <Button key="closeResults" plain label={t('closeResults')} onPress={() => closeResults($)} />
            </Box>
            {listed.tracks.map((one, index) => row('result', one, String(index + 1), () => void pick($, config, one)))}
          </Box>
        )}
        {track && now && (
          <Box flexDirection="column" gap={LAYOUT.sectionGap}>
            {coverArt}
            <Box flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between" gap={LAYOUT.buttonGap}>
                <Box flexDirection="column" flexShrink={1}>
                  <Text bold>{splitTitle(track.title).name}</Text>
                  <Text dimColor>{subLine()}</Text>
                </Box>
                {link && <Link href={link} label={t('youtube')} />}
              </Box>
              {now.isLoading ? <Text dimColor>{t('loading')}</Text> : progress}
              <Box flexDirection="row" justifyContent="space-between">
                <Text dimColor>{elapsed}</Text>
                <Text dimColor>{total}</Text>
              </Box>
            </Box>
            <Box flexDirection="column" alignItems="center">
              <Box flexDirection="row" flexWrap="wrap" justifyContent="center" alignItems="center" gap={LAYOUT.buttonGap}>
                <Button key="previous" label={ICONS.previous} onPress={() => skip($, config, -1)} />
                <Button key="toggle" onPress={() => toggle($, config)}>
                  <Text bold color={accent}>
                    {now.isPlaying ? ICONS.pause : ICONS.play}
                  </Text>
                </Button>
                <Button key="next" label={ICONS.next} onPress={() => skip($, config, 1)} />
                <Button key="stop" label={ICONS.stop} onPress={() => stop($)} />
              </Box>
              <Box flexDirection="row" alignItems="center" gap={LAYOUT.buttonGap}>
                <Text dimColor>{t('volumeLabel')}</Text>
                {volumeControl()}
                <Text dimColor>{t('volume', { level: String(level) })}</Text>
              </Box>
              <Button key="radio" plain onPress={() => toggleRadio($)}>
                {follows ? <Text color={accent}>{t('radioOn')}</Text> : <Text dimColor>{t('radioOff')}</Text>}
              </Button>
            </Box>
          </Box>
        )}
        {loading === 'radio' && <Text dimColor>{t('loading')}</Text>}
        {track && now && (
          <Box flexDirection="column">
            {heading('lyricsHeading')}
            {lyricLines()}
          </Box>
        )}
        {track && (upcoming.length > 0 || follows) && (
          <Box flexDirection="column">
            {heading('upNextHeading')}
            {upcoming.map((one, index) => row('next', one, String(index + 1), () => void play($, config, one)))}
            {follows && !hasMore && <Text dimColor>{t('thenSimilar', { name: splitTitle(track.title).name })}</Text>}
          </Box>
        )}
        {shown && (
          <Box flexDirection="column">
            {heading('libraryHeading')}
            {albumChoice()}
            {loading === 'album' && <Text dimColor>{t('loading')}</Text>}
            {shown.tracks.map((one, index) =>
              row('shelf', one, splitTitle(one.title).number || String(index + 1), () => void play($, config, one)),
            )}
          </Box>
        )}
        <Box flexDirection="row" alignItems="center" gap={LAYOUT.buttonGap}>
          <Text dimColor>{t('theme')}</Text>
          {(Object.keys(THEMES) as ThemeName[]).map(name => (
            <Button key={`theme:${name}`} plain onPress={() => chooseTheme($, name)}>
              <Text color={THEMES[name]}>{name === themeName ? ICONS.themeChosen : ICONS.themeOther}</Text>
            </Button>
          ))}
        </Box>
      </Box>
    )
  })
}
