import { describe, expect, test } from 'claude-code/testing'
import type { Mounted } from 'claude-code/testing'

import { ICONS } from './icons'
import { THEMES } from './palette'

const PANE = {
  component: 'Pane',
  requestId: 'music-pane',
  props: { title: 'Music', isFocused: true, bodyColumns: 80, placement: 'dock' },
}
const OPTIONS = { options: { library: '/music', artist: 'Band' } }
const CHANNEL = { options: { channel: '@band', artist: 'Band' } }
const ALBUM = '/music/Album One'
const FIRST = '/music/Album One/Songs/01 - Song.mp3'
const SECOND = '/music/Album One/Songs/02 - Other.mp3'
const COVER = '/music/Album One/Portada.png'
const PLAYLIST = 'https://www.youtube.com/playlist?list=PL1'
const VIDEO = 'https://www.youtube.com/watch?v=v1'
const STREAM = 'https://stream.example/v1'
const LIKE = 'https://www.youtube.com/watch?v=v5'
const LIKE_STREAM = 'https://stream.example/v5'
const MIX = 'https://www.youtube.com/watch?v=v1&list=RDv1'
const SRT = '1\n00:00:01,000 --> 00:00:02,000\nFirst line\n\n2\n00:00:03,000 --> 00:00:04,000\n♪ Second line ♪\n'
const SURFACES = ['terminal', 'desktop'] as const
const IDLE = 'Search a song, a singer or a line of the lyrics.'
const SONG_LENGTH_S = 180
const CRLF = String.fromCharCode(13, 10)
const RECONNECT = '--stream-lavf-o=reconnect=1,reconnect_streamed=1,reconnect_on_network_error=1,reconnect_delay_max=5'
const MISSING = 'nowhere'

const dir = (name: string) => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })
const file = (name: string) => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })
const TREE: Record<string, unknown[]> = {
  '/music': [dir('Album One'), dir('.cache')],
  '/music/Album One': [file('Portada.png'), dir('Songs'), dir('Videos')],
  '/music/Album One/Songs': [file('01 - Song.mp3'), file('02 - Other.mp3'), file('02 - Other.txt')],
  '/music/Album One/Videos': [file('01 - Song.srt')],
}
const YOUTUBE: Record<string, unknown> = {
  'https://www.youtube.com/@band/playlists': { entries: [{ id: 'PL1', title: 'Live Set', url: PLAYLIST }] },
  [PLAYLIST]: { title: 'Live Set', entries: [{ id: 'v1', title: 'Band - Song One (Official Lyric Video)', duration: SONG_LENGTH_S }] },
  [VIDEO]: { url: STREAM, duration: 2, subtitles: { 'es-a': [{ ext: 'vtt', url: 'https://subs/v1.vtt' }, { ext: 'srt', url: 'https://subs/v1.srt' }] } },
  [MIX]: {
    entries: [
      { id: 'v1', title: 'Band - Song One' },
      { id: 'v9', title: 'Band - Song One (Live)' },
      { id: 'v5', title: 'Band - Like One (Official Video)', duration: 150 },
    ],
  },
  [LIKE]: { url: LIKE_STREAM, duration: 1 },
  'ytsearch8:Second line': { entries: [{ id: 'v3', title: 'Someone - Tune (Official Video)', channel: 'Someone', duration: 200 }] },
  'https://www.youtube.com/playlist?list=PL2': {
    title: 'Mix',
    webpage_url: 'https://www.youtube.com/playlist?list=PL2',
    entries: [{ id: 'v2', title: 'Other (Official Video)', duration: 95 }],
  },
}

const pause = () => new Promise(done => (globalThis as any).setTimeout(done, 5))
const until = async (check: () => Promise<unknown>) => {
  for (let i = 0; i < 400 && !(await check()); i++) await pause()
}
const portable = (path: string) => path.replace(/^[A-Za-z]:/, '').replaceAll('\\', '/')
const line = (kind: string, seconds: number) => `@${kind} ${seconds.toFixed(3)}${CRLF}`
const option = (argv: string[], name: string) => argv.find(one => one.startsWith(`--${name}=`))?.slice(name.length + 3)

type Song = { positions: number[]; holds: boolean; lengthS?: number }

function engine(on: any, songs: Record<string, Song>) {
  const spawned: string[][] = []
  const stopped: string[] = []
  const runs: string[][] = []
  const writes: { path: string; text: string }[] = []
  const pulls = { count: 0 }
  const opened: string[] = []
  const stored: Record<string, unknown> = {}
  const seeded = new Map<string, unknown>()
  const sets: { key: string; value: unknown }[] = []
  on('state.get', (_$: any, e: any, next: any) => (seeded.has(e.key) ? { value: { value: seeded.get(e.key), version: 0 } } : next(e)))
  on('state.set', (_$: any, e: any, next: any) => {
    seeded.delete(e.key)
    sets.push({ key: e.key, value: e.value })
    return next(e)
  })
  on('session.start', (_$: any, e: any) => ({ sessionId: 's', cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: `mcp__music-pane__${e.name}` } }))
  on('settings.read', () => ({ value: { language: 'English' } }))
  on('store.get', (_$: any, e: any) => ({ value: stored[e.key] }))
  on('store.set', (_$: any, e: any) => ((stored[e.key] = e.value), { value: undefined }))
  on('env.get', (_$: any, e: any) => ({ value: e.name === 'TEMP' ? '/tmp' : undefined }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', (_$: any, e: any) => (writes.push({ path: e.path, text: e.text }), { value: undefined }))
  on('fs.list', (_$: any, e: any) => ({ value: TREE[portable(e.path)] ?? [] }))
  on('fs.read', (_$: any, e: any) => {
    if (e.as === 'bytes') return { value: { base64: 'Q09WRVI=' } }
    return { value: e.path.endsWith('.srt') ? SRT : 'Plain verse\none\n\nPlain chorus' }
  })
  on('http.fetch', (_$: any, e: any) => ({ value: { status: 200, ok: e.url === 'https://subs/v1.srt', headers: {}, text: SRT } }))
  on('process.run', (_$: any, e: any) => {
    const argv: string[] = e.argv
    runs.push(argv)
    if (argv[0] === MISSING) throw new Error(`${MISSING} not found`)
    if (argv[0] === 'ffmpeg') return { value: { exitCode: 0, stdout: '', stderr: '' } }
    const answer = YOUTUBE[argv.at(-1)!]
    return { value: answer ? { exitCode: 0, stdout: JSON.stringify(answer), stderr: '' } : { exitCode: 1, stdout: '', stderr: 'ERROR' } }
  })
  on('ui.open', (_$: any, e: any) => (opened.push(e.id), { value: { isPlaced: true } }))
  on('process.spawn', async function* (_$: any, e: any) {
    const source: string = e.argv.at(-1)
    const song = songs[source] ?? { positions: [], holds: false }
    const last = song.positions.at(-1) ?? 0
    spawned.push(e.argv)
    if (e.argv[0] === MISSING) throw new Error(`${MISSING} not found`)
    try {
      yield { stream: 'stdout', text: song.positions.length > 0 ? line('len', song.lengthS ?? last + 1) : `Failed to open${CRLF}` }
      for (const seconds of song.positions) {
        pulls.count++
        yield { stream: 'stdout', text: line('pos', seconds) }
        await pause()
      }
      while (song.holds) {
        pulls.count++
        yield { stream: 'stdout', text: line('pos', last) }
        await pause()
      }
    } finally {
      stopped.push(source)
    }
    return { value: { code: 0, signal: null } }
  })
  const control = () => JSON.parse(writes.filter(one => one.path.endsWith('music-pane-control.json')).at(-1)?.text ?? '{}')
  const lastSet = (key: string) => sets.filter(one => one.key === key).at(-1)?.value
  return { spawned, stopped, pulls, opened, runs, stored, control, seeded, lastSet }
}

async function startPane($: any, surface: 'terminal' | 'desktop' | 'mobile' = 'desktop') {
  await $.session.start({ surface, isInteractive: true, cwd: '/work' })
  return (await $.ui.mount({ plugin: 'music-pane', surface, ...PANE })) as Mounted<'desktop'>
}

describe('music-pane', () => {
  test('opens the pane at start, and again when Claude calls its tool', OPTIONS, async ($, on) => {
    const { opened } = engine(on, {})
    await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' } as any)
    await until(async () => opened.length === 1)
    expect(await $.tool.call({ tool: 'mcp__music-pane__open' } as any)).toMatchObject({ result: 'Music player opened.' })
    expect(opened).toEqual(['music-pane', 'music-pane'])
  })

  test('stays closed at start with openOnStart off', { options: { ...OPTIONS.options, openOnStart: false } }, async ($, on) => {
    const { opened } = engine(on, {})
    await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' } as any)
    await pause()
    expect(opened).toEqual([])
  })

  for (const surface of SURFACES) {
    test(`plays with mpv, pauses and resumes in place, and drags the volume live on ${surface}`, OPTIONS, async ($, on) => {
      const { spawned, stopped, pulls, stored, control, lastSet } = engine(on, { [FIRST]: { positions: [0.5, 1.2], holds: true, lengthS: SONG_LENGTH_S } })
      const pane = await startPane($, surface)
      await until(() => pane.find({ key: `shelf:${ALBUM}|${FIRST}` }))

      const playing = pane.press({ key: `shelf:${ALBUM}|${FIRST}` })
      await until(async () => pulls.count >= 4)
      const argv = spawned[0]!
      expect(argv.slice(0, 8)).toEqual(['mpv', '--no-video', '--no-config', '--quiet', '--msg-level=all=warn', '--idle=no', '--volume=100', '--start=0.000'])
      expect(option(argv, 'script')).toMatch(/[\\/]player[\\/]control\.lua$/)
      expect(option(argv, 'script-opts')).toMatch(/^music-pane-control=.*music-pane-control\.json,music-pane-run=\d+$/)
      expect(argv).not.toContain(RECONNECT)
      expect(argv.at(-1)).toBe(FIRST)
      expect(control()).toMatchObject({ volume: 100, pause: false })

      const paused = pane.press({ key: 'toggle' })
      await until(async () => control().pause === true && (lastSet('playback') as any)?.isPlaying === false)
      expect(lastSet('playback')).toMatchObject({ isPlaying: false, positionMs: 1200, durationMs: SONG_LENGTH_S * 1000 })
      const resumed = pane.press({ key: 'toggle' })
      await until(async () => control().pause === false && (lastSet('playback') as any)?.isPlaying === true)
      expect(spawned).toHaveLength(1)
      expect(stopped).toEqual([])

      const grabbed = pane.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'volume' })
      await until(async () => control().volume === 0)
      expect(control()).toMatchObject({ volume: 0, pause: false })
      const dragged = pane.pointer({ type: 'move', x: 30, y: 0, button: 'left', in: 'volume' })
      const released = pane.pointer({ type: 'up', x: 30, y: 0, button: 'left', in: 'volume' })
      await until(async () => control().volume === 100 && stored.volume === 100)
      expect(spawned).toHaveLength(1)

      const stopping = pane.press({ key: 'stop' })
      await Promise.all([playing, paused, resumed, grabbed, dragged, released, stopping])
      expect(stopped).toEqual([FIRST])
      await pane.unmount()
    })
  }

  test('draws the song playing in the chosen theme', OPTIONS, async ($, on) => {
    const { stored, seeded } = engine(on, {})
    stored.theme = 'blue'
    stored.volume = 80
    seeded.set('lyrics', {
      trackId: FIRST,
      cues: [
        { startMs: 1000, text: 'First line' },
        { startMs: 3000, text: 'Second line' },
      ],
      stanzas: [],
    })
    seeded.set('cover', { source: COVER, data: 'Q09WRVI=' })
    seeded.set('playback', {
      albumId: ALBUM,
      trackId: FIRST,
      positionMs: 1200,
      durationMs: SONG_LENGTH_S * 1000,
      source: FIRST,
      isPlaying: false,
      isLoading: false,
    })
    const pane = await startPane($)
    await until(() => pane.find({ key: `next:${ALBUM}|${SECOND}` }))
    expect(await pane.find({ type: 'Text', text: 'Song' })).toMatchObject({ props: { bold: true } })
    expect(await pane.find({ type: 'Text', text: '0:01' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '3:00' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'LYRICS' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'First line' })).toMatchObject({ props: { bold: true, color: THEMES.blue } })
    expect(await pane.find({ type: 'Text', text: 'Second line' })).toMatchObject({ props: { dimColor: true } })
    expect(await pane.find({ type: 'Text', text: 'UP NEXT' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'Then: songs like Song' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: ICONS.play })).toMatchObject({ props: { color: THEMES.blue } })
    expect(await pane.find({ type: 'Text', text: '80 %' })).toBeDefined()
    expect(await pane.find({ key: 'volume' })).toBeDefined()
    expect(await pane.findAll({ type: 'Svg' })).toHaveLength(2)
    expect(await pane.find({ key: 'theme:blue', text: ICONS.themeChosen })).toBeDefined()
    await pane.unmount()
  })

  test('turns the volume with buttons where there is no slider', OPTIONS, async ($, on) => {
    const { stored, seeded } = engine(on, {})
    seeded.set('playback', {
      albumId: ALBUM,
      trackId: FIRST,
      positionMs: 0,
      source: FIRST,
      isPlaying: false,
      isLoading: false,
    })
    const pane = await startPane($, 'mobile')
    await until(() => pane.find({ key: 'quieter' }))
    expect(await pane.find({ key: 'volume' })).toBeUndefined()
    await pane.press({ key: 'quieter' })
    await pane.press({ key: 'quieter' })
    expect(await pane.find({ type: 'Text', text: '80 %' })).toBeDefined()
    expect(stored.volume).toBe(80)
    await pane.unmount()
  })

  test('goes on to the next song when one ends', OPTIONS, async ($, on) => {
    const { spawned } = engine(on, {
      [FIRST]: { positions: [0.1], holds: false },
      [SECOND]: { positions: [0.1], holds: false },
    })
    const pane = await startPane($)
    await until(() => pane.find({ key: `shelf:${ALBUM}|${FIRST}` }))
    await pane.press({ key: `shelf:${ALBUM}|${FIRST}` })
    await until(async () => (await pane.find({ key: 'search' })) !== undefined && spawned.length === 2)
    expect(spawned.map(argv => argv.at(-1))).toEqual([FIRST, SECOND])
    await pane.unmount()
  })

  test('picks a song up where it was cut instead of skipping it', OPTIONS, async ($, on) => {
    const { spawned } = engine(on, {
      [FIRST]: { positions: [0.5, 1.2], holds: false, lengthS: SONG_LENGTH_S },
      [SECOND]: { positions: [0.1], holds: false },
    })
    const pane = await startPane($)
    await until(() => pane.find({ key: `shelf:${ALBUM}|${FIRST}` }))
    await pane.press({ key: `shelf:${ALBUM}|${FIRST}` })
    await until(async () => spawned.length === 4)
    expect(spawned.map(argv => [argv.at(-1), option(argv, 'start')])).toEqual([
      [FIRST, '0.000'],
      [FIRST, '1.200'],
      [FIRST, '1.200'],
      [SECOND, '0.000'],
    ])
    await pane.unmount()
  })

  test('loads the plain lyrics of a song without an srt', OPTIONS, async ($, on) => {
    const { pulls, lastSet } = engine(on, { [SECOND]: { positions: [0.1], holds: true } })
    const pane = await startPane($)
    await until(() => pane.find({ key: `shelf:${ALBUM}|${SECOND}` }))
    const playing = pane.press({ key: `shelf:${ALBUM}|${SECOND}` })
    await until(async () => pulls.count >= 2)
    expect(lastSet('lyrics')).toMatchObject({ trackId: SECOND, cues: [], stanzas: ['Plain verse\none', 'Plain chorus'] })
    await pane.press({ key: 'stop' })
    await playing
    await pane.unmount()
  })

  test('says why the player never played, and does not skip ahead', OPTIONS, async ($, on) => {
    const { spawned } = engine(on, {})
    const pane = await startPane($)
    await until(() => pane.find({ key: `shelf:${ALBUM}|${FIRST}` }))
    await pane.press({ key: `shelf:${ALBUM}|${FIRST}` })
    expect(await pane.find({ type: 'Text', text: 'mpv could not play 01 - Song: Failed to open' })).toBeDefined()
    expect(spawned).toHaveLength(1)
    await pane.unmount()
  })

  test('says the player cannot run when it is not there', { options: { ...OPTIONS.options, player: MISSING } }, async ($, on) => {
    engine(on, {})
    const pane = await startPane($)
    await until(() => pane.find({ key: `shelf:${ALBUM}|${FIRST}` }))
    await pane.press({ key: `shelf:${ALBUM}|${FIRST}` })
    expect(await pane.find({ type: 'Text', text: `Could not run ${MISSING}. Install it, or set its full path in the mod options.` })).toBeDefined()
    await pane.unmount()
  })

  test("asks YouTube again for a video's audio that never played, then says why", CHANNEL, async ($, on) => {
    const { spawned, runs } = engine(on, {})
    const pane = await startPane($)
    await until(() => pane.find({ key: `shelf:${PLAYLIST}|${VIDEO}` }))
    await pane.press({ key: `shelf:${PLAYLIST}|${VIDEO}` })
    await until(() => pane.find({ type: 'Text', text: /could not play .*: Failed to open$/ }))
    expect(spawned).toHaveLength(3)
    expect(runs.filter(argv => argv.at(-1) === VIDEO)).toHaveLength(3)
    await pane.unmount()
  })

  test('says yt-dlp cannot run instead of finding nothing', { options: { ...OPTIONS.options, ytdlp: MISSING } }, async ($, on) => {
    engine(on, {})
    const pane = await startPane($)
    await until(() => pane.find({ key: 'search' }))
    await pane.input({ key: 'search', text: 'Nothing like this' })
    expect(await pane.find({ type: 'Text', text: `Could not run ${MISSING}. Install it, or set its full path in the mod options.` })).toBeDefined()
    await pane.unmount()
  })

  test("plays a channel's video with reconnection, then similar songs that are not the same one", CHANNEL, async ($, on) => {
    const { spawned, runs } = engine(on, { [STREAM]: { positions: [1.5], holds: false }, [LIKE_STREAM]: { positions: [0.1], holds: false } })
    const pane = await startPane($)
    await until(() => pane.find({ key: `shelf:${PLAYLIST}|${VIDEO}` }))
    expect(await pane.find({ type: 'Text', text: /3:00/ })).toBeDefined()
    await pane.press({ key: `shelf:${PLAYLIST}|${VIDEO}` })
    await until(async () => spawned.length === 2 && (await pane.find({ key: 'quick:Romantic salsa' })) !== undefined)
    expect(spawned.map(argv => argv.at(-1))).toEqual([STREAM, LIKE_STREAM])
    expect(spawned[0]).toContain(RECONNECT)
    expect(runs.find(argv => argv.includes(MIX))).toEqual(['yt-dlp', '--flat-playlist', '--playlist-end', '25', '-J', MIX])
    expect(runs.some(argv => argv.includes('https://www.youtube.com/watch?v=v9'))).toBe(false)
    await pane.unmount()
  })

  test('stops at the end of the album with similar songs off', CHANNEL, async ($, on) => {
    const { spawned, runs } = engine(on, { [STREAM]: { positions: [1.5], holds: false } })
    const pane = await startPane($)
    await until(() => pane.find({ key: `shelf:${PLAYLIST}|${VIDEO}` }))
    const playing = pane.press({ key: `shelf:${PLAYLIST}|${VIDEO}` })
    await until(async () => spawned.length === 1)
    await pane.press({ key: 'radio' })
    await playing
    expect(runs.some(argv => argv.includes(MIX))).toBe(false)
    expect(spawned).toHaveLength(1)
    await pane.unmount()
  })

  test('searches the lyrics and YouTube, and offers the closest line for a typo', OPTIONS, async ($, on) => {
    const { spawned } = engine(on, {})
    const pane = await startPane($)
    await until(() => pane.find({ key: 'search' }))
    await pane.input({ key: 'search', text: 'Second line' })
    expect(await pane.find({ type: 'Text', text: 'RESULTS FOR SECOND LINE' })).toBeDefined()
    expect(await pane.find({ key: `result:search:Second line|${FIRST}`, text: /Song.*Album One/ })).toBeDefined()
    expect(await pane.find({ key: 'result:search:Second line|https://www.youtube.com/watch?v=v3', text: /Tune.*Someone · 3:20/ })).toBeDefined()
    await pane.press({ key: 'closeResults' })
    expect(await pane.find({ type: 'Text', text: 'RESULTS FOR SECOND LINE' })).toBeUndefined()

    await pane.input({ key: 'search', text: 'Secnd line' })
    expect(await pane.find({ type: 'Text', text: 'Nothing found for Secnd line.' })).toBeDefined()
    expect(await pane.find({ key: 'suggestion', text: 'Did you mean "Second line" (Song)?' })).toBeDefined()
    await pane.press({ key: 'suggestion' })
    expect(spawned[0]?.at(-1)).toBe(FIRST)
    await pane.unmount()
  })

  test('adds a pasted YouTube link as an album', OPTIONS, async ($, on) => {
    engine(on, {})
    const pane = await startPane($)
    await until(() => pane.find({ key: 'search' }))
    await pane.input({ key: 'search', text: 'https://www.youtube.com/playlist?list=PL2' })
    expect(await pane.find({ key: 'result:https://www.youtube.com/playlist?list=PL2|https://www.youtube.com/watch?v=v2' })).toBeDefined()
    expect(await pane.find({ key: 'album' })).toMatchObject({ props: { value: 'https://www.youtube.com/playlist?list=PL2' } })
    await pane.unmount()
  })

  test('plays what Claude is asked for through its play tool', OPTIONS, async ($, on) => {
    const { spawned, opened } = engine(on, {})
    await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' } as any)
    await until(async () => opened.length === 1)
    await pause()
    const answer = await $.tool.call({ tool: 'mcp__music-pane__play', query: 'Second line' } as any)
    expect(answer).toMatchObject({ result: 'Playing Song in the music player.' })
    await until(async () => spawned.length === 1)
    expect(spawned[0]?.at(-1)).toBe(FIRST)
  })

  test('remembers what was played and plays it again from the start screen', OPTIONS, async ($, on) => {
    const { spawned, stored } = engine(on, {})
    stored.history = [{ id: VIDEO, album: 'history', title: 'Song One', page: VIDEO, byline: 'Band' }]
    stored.volume = 60
    const pane = await startPane($)
    await until(() => pane.find({ type: 'Text', text: 'PLAYED LATELY' }))
    expect(await pane.find({ key: `recent:history|${VIDEO}`, text: /Song One.*Band/ })).toBeDefined()
    await pane.press({ key: `recent:history|${VIDEO}` })
    expect(spawned[0]?.at(-1)).toBe(STREAM)
    expect(option(spawned[0]!, 'volume')).toBe('60')
    await pane.unmount()
  })

  test('picks a theme from its dots and keeps it', OPTIONS, async ($, on) => {
    const { stored } = engine(on, {})
    const pane = await startPane($)
    await until(() => pane.find({ key: 'theme:pink', text: ICONS.themeChosen }))
    await pane.press({ key: 'theme:blue' })
    expect(stored.theme).toBe('blue')
    expect(await pane.find({ key: 'theme:blue', text: ICONS.themeChosen })).toBeDefined()
    expect(await pane.find({ key: 'theme:pink', text: ICONS.themeOther })).toBeDefined()
    await pane.unmount()
  })

  test('greets with a title, ideas to start with, and the search alone when nothing is set', async ($, on) => {
    const { runs } = engine(on, {})
    const pane = await startPane($)
    await until(() => pane.find({ key: 'search' }))
    expect(await pane.findAll({ type: 'Svg' })).toHaveLength(1)
    expect(await pane.find({ type: 'Text', text: 'TRY' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'LIBRARY' })).toBeUndefined()
    await pane.press({ key: 'quick:Romantic salsa' })
    expect(runs.some(argv => argv.includes('ytsearch8:Romantic salsa'))).toBe(true)
    await pane.unmount()
  })
})
