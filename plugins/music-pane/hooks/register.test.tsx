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
const status = (seconds: number) => `   ${seconds.toFixed(2)} M-A:  0.000 fd=   0 aq=    4KB vq=    0KB sq=    0B \r`
const durationLine = (seconds: number) => {
  const whole = Math.floor(seconds)
  const clock = [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60].map(part => String(part).padStart(2, '0'))
  return `  Duration: ${clock.join(':')}.${String(Math.round((seconds % 1) * 100)).padStart(2, '0')}, start: 0.000000\n`
}
const startOf = (argv: string[]) => argv[argv.indexOf('-ss') + 1]

type Song = { positions: number[]; holds: boolean; lengthS?: number }

function engine(on: any, songs: Record<string, Song>) {
  const spawned: string[][] = []
  const stopped: string[] = []
  const runs: string[][] = []
  const pulls = { count: 0 }
  const opened: string[] = []
  const stored: Record<string, unknown> = {}
  on('session.start', (_$: any, e: any) => ({ sessionId: 's', cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: `mcp__music-pane__${e.name}` } }))
  on('settings.read', () => ({ value: { language: 'English' } }))
  on('store.get', (_$: any, e: any) => ({ value: stored[e.key] }))
  on('store.set', (_$: any, e: any) => ((stored[e.key] = e.value), { value: undefined }))
  on('env.get', (_$: any, e: any) => ({ value: e.name === 'TEMP' ? '/tmp' : undefined }))
  on('fs.exists', () => ({ value: false }))
  on('fs.list', (_$: any, e: any) => ({ value: TREE[portable(e.path)] ?? [] }))
  on('fs.read', (_$: any, e: any) => {
    if (e.as === 'bytes') return { value: { base64: 'Q09WRVI=' } }
    return { value: e.path.endsWith('.srt') ? SRT : 'Plain verse\none\n\nPlain chorus' }
  })
  on('http.fetch', (_$: any, e: any) => ({ value: { status: 200, ok: e.url === 'https://subs/v1.srt', headers: {}, text: SRT } }))
  on('process.run', (_$: any, e: any) => {
    const argv: string[] = e.argv
    runs.push(argv)
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
    try {
      yield { stream: 'stderr', text: song.positions.length > 0 ? durationLine(song.lengthS ?? last + 1) : 'No such file\n' }
      for (const seconds of song.positions) {
        pulls.count++
        yield { stream: 'stderr', text: status(seconds) }
        await pause()
      }
      while (song.holds) {
        pulls.count++
        yield { stream: 'stderr', text: status(last) }
        await pause()
      }
    } finally {
      stopped.push(source)
    }
    return { value: { code: 0, signal: null } }
  })
  return { spawned, stopped, pulls, opened, runs, stored }
}

async function startPane($: any, surface: 'terminal' | 'desktop' = 'desktop') {
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
    test(`plays a song, pauses it on its synced line and resumes there on ${surface}`, OPTIONS, async ($, on) => {
      const { spawned, stopped, pulls, runs } = engine(on, { [FIRST]: { positions: [0.5, 1.2], holds: true, lengthS: SONG_LENGTH_S } })
      const pane = await startPane($, surface)
      await until(() => pane.find({ key: `shelf:${ALBUM}|${FIRST}` }))
      expect(await pane.find({ type: 'Text', text: IDLE })).toBeUndefined()

      const playing = pane.press({ key: `shelf:${ALBUM}|${FIRST}` })
      await until(async () => pulls.count >= 4)
      await pane.press({ key: 'toggle' })
      await playing
      expect(spawned[0]).toEqual(['ffplay', '-nodisp', '-vn', '-autoexit', '-loglevel', 'info', '-stats', '-volume', '100', '-ss', '0.000', FIRST])
      expect(stopped).toEqual([FIRST])
      expect(await pane.find({ type: 'Text', text: '0:01' })).toBeDefined()
      expect(await pane.find({ type: 'Text', text: '3:00' })).toBeDefined()
      expect(await pane.find({ type: 'Text', text: 'LYRICS' })).toBeDefined()
      expect(await pane.find({ type: 'Text', text: 'UP NEXT' })).toBeDefined()
      expect(await pane.find({ key: `next:${ALBUM}|${SECOND}`, text: /Other/ })).toBeDefined()
      expect(await pane.find({ type: 'Text', text: 'Then: songs like Song' })).toBeDefined()
      expect(await pane.find({ type: 'Text', text: 'Song' })).toMatchObject({ props: { bold: true } })
      expect(await pane.find({ type: 'Text', text: 'First line' })).toMatchObject({ props: { bold: true } })
      expect(await pane.find({ type: 'Text', text: 'Second line' })).toMatchObject({ props: { dimColor: true } })
      expect(await pane.find({ type: 'Text', text: ICONS.play })).toBeDefined()
      expect(await pane.find({ type: 'Text', text: '100 %' })).toBeDefined()
      expect(runs.find(argv => argv[0] === 'ffmpeg')).toContain('/music/Album One/Portada.png')
      expect(await pane.findAll({ type: 'Svg' })).toHaveLength(surface === 'desktop' ? 2 : 0)

      const resumed = pane.press({ key: 'toggle' })
      await until(async () => spawned.length === 2)
      await pane.press({ key: 'stop' })
      await resumed
      expect(startOf(spawned[1]!)).toBe('1.200')
      expect(stopped).toEqual([FIRST, FIRST])
      await pane.unmount()
    })
  }

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
    expect(spawned.map(argv => [argv.at(-1), startOf(argv)])).toEqual([
      [FIRST, '0.000'],
      [FIRST, '1.200'],
      [FIRST, '1.200'],
      [SECOND, '0.000'],
    ])
    await pane.unmount()
  })

  test('shows the plain lyrics of a song without an srt', OPTIONS, async ($, on) => {
    const { pulls } = engine(on, { [SECOND]: { positions: [0.1], holds: true } })
    const pane = await startPane($)
    await until(() => pane.find({ key: `shelf:${ALBUM}|${SECOND}` }))
    const playing = pane.press({ key: `shelf:${ALBUM}|${SECOND}` })
    await until(async () => pulls.count >= 2)
    await pane.press({ key: 'toggle' })
    await playing
    expect(await pane.find({ type: 'Text', text: 'Plain verse\none' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'Plain chorus' })).toBeDefined()
    await pane.unmount()
  })

  test('says so when the player never plays, and does not skip ahead', OPTIONS, async ($, on) => {
    const { spawned } = engine(on, {})
    const pane = await startPane($)
    await until(() => pane.find({ key: `shelf:${ALBUM}|${FIRST}` }))
    await pane.press({ key: `shelf:${ALBUM}|${FIRST}` })
    expect(await pane.find({ type: 'Text', text: 'ffplay could not play 01 - Song.' })).toBeDefined()
    expect(spawned).toHaveLength(1)
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
    expect(spawned[0]).toContain('-reconnect')
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

  test('turns the volume down and keeps it for the next song', OPTIONS, async ($, on) => {
    const { spawned, pulls, stored } = engine(on, { [FIRST]: { positions: [0.5, 1.2], holds: true, lengthS: SONG_LENGTH_S } })
    const pane = await startPane($)
    await until(() => pane.find({ key: `shelf:${ALBUM}|${FIRST}` }))
    const playing = pane.press({ key: `shelf:${ALBUM}|${FIRST}` })
    await until(async () => pulls.count >= 4)
    await pane.press({ key: 'toggle' })
    await playing
    await pane.press({ key: 'louder' })
    await pane.press({ key: 'quieter' })
    await pane.press({ key: 'quieter' })
    expect(await pane.find({ type: 'Text', text: '80 %' })).toBeDefined()
    expect(stored.volume).toBe(80)
    const resumed = pane.press({ key: 'toggle' })
    await until(async () => spawned.length === 2)
    await pane.press({ key: 'stop' })
    await resumed
    expect(spawned[1]?.[spawned[1].indexOf('-volume') + 1]).toBe('80')
    await pane.unmount()
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
    expect(spawned[0]?.[spawned[0].indexOf('-volume') + 1]).toBe('60')
    await pane.unmount()
  })

  test('paints the player in the chosen theme and keeps the choice', OPTIONS, async ($, on) => {
    const { stored, pulls } = engine(on, { [FIRST]: { positions: [0.5, 1.2], holds: true, lengthS: SONG_LENGTH_S } })
    const pane = await startPane($)
    await until(() => pane.find({ key: `shelf:${ALBUM}|${FIRST}` }))
    expect(await pane.find({ key: 'theme:pink', text: ICONS.themeChosen })).toBeDefined()
    await pane.press({ key: 'theme:blue' })
    expect(stored.theme).toBe('blue')
    expect(await pane.find({ key: 'theme:blue', text: ICONS.themeChosen })).toBeDefined()
    const playing = pane.press({ key: `shelf:${ALBUM}|${FIRST}` })
    await until(async () => pulls.count >= 4)
    await pane.press({ key: 'toggle' })
    await playing
    expect(await pane.find({ type: 'Text', text: 'First line' })).toMatchObject({ props: { color: THEMES.blue } })
    expect(await pane.find({ type: 'Text', text: ICONS.play })).toMatchObject({ props: { color: THEMES.blue } })
    await pane.unmount()
  })

  test('starts in the theme chosen before', OPTIONS, async ($, on) => {
    const { stored } = engine(on, {})
    stored.theme = 'green'
    const pane = await startPane($)
    await until(() => pane.find({ key: 'theme:green', text: ICONS.themeChosen }))
    expect(await pane.find({ key: 'theme:green', text: ICONS.themeChosen })).toBeDefined()
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
