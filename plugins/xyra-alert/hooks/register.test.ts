import { describe, expect, mock, test } from 'claude-code/testing'

import type { XyraState } from './alerts'

const APPDATA = 'C:\\Users\\me\\AppData\\Roaming'
const CONFIG = `${APPDATA}\\com.indagalab.xyra\\config.json`
const CODE = 'pairing-code'
const TOKEN = 'device-token'
const RETRY_MS = 30_000
const STEPS = 12

const IDLE: XyraState = { phase: 'client', ready_check: false, champ_select: null, game: null, lobby: { searching: true } }
const FOUND: XyraState = { ...IDLE, ready_check: true }
const PICKING: XyraState = { ...IDLE, phase: 'champSelect', lobby: null, champ_select: { champion: { name: 'Jinx' } } }
const PLAYING: XyraState = { ...IDLE, phase: 'inGame', lobby: null, game: { champion: { name: 'Jinx' } } }

type Xyra = { states: XyraState[]; autoAccept: boolean; isOpen: boolean; language: string }

const json = (body: unknown, status = 200) => ({
  value: { status, ok: status < 300, headers: {}, text: JSON.stringify(body) },
})

function engine(on: any, xyra: Xyra) {
  const clock = mock.clock(on, { now: 0 })
  const toasts: string[] = []
  const stored: Record<string, unknown> = {}
  const paths: string[] = []
  let served = 0
  on('session.start', (_$: any, e: any) => ({ sessionId: 's', cwd: e.cwd }))
  on('settings.read', () => ({ value: { language: xyra.language } }))
  on('env.get', (_$: any, e: any) => ({ value: e.name === 'APPDATA' ? APPDATA : undefined }))
  on('fs.read', (_$: any, e: any) => {
    if (e.path !== CONFIG) throw new Error(`${e.path} not found`)
    return { value: JSON.stringify({ phone_link: true, phone_token: CODE }) }
  })
  on('store.get', (_$: any, e: any) => ({ value: stored[e.key] }))
  on('store.set', (_$: any, e: any) => ((stored[e.key] = e.value), { value: undefined }))
  on('store.delete', (_$: any, e: any) => (delete stored[e.key], { value: undefined }))
  on('ui.toast', (_$: any, e: any) => (toasts.push(e.text), { value: undefined }))
  on('http.fetch', (_$: any, e: any) => {
    if (!xyra.isOpen) throw new Error('connection refused')
    const url = new URL(e.url)
    paths.push(`${e.init?.method ?? 'GET'} ${url.pathname}`)
    const key = url.searchParams.get('t')
    if (url.pathname === '/api/pair') return key === CODE ? json({ token: TOKEN }) : json('forbidden', 403)
    if (key !== TOKEN) return json('forbidden', 403)
    if (url.pathname === '/api/settings') return json({ auto_accept: xyra.autoAccept })
    const index = Math.min(served++, xyra.states.length - 1)
    return json({ version: index + 1, state: xyra.states[index] })
  })
  const run = async (steps = STEPS) => {
    for (let i = 0; i < steps; i++) await clock.advance(1)
  }
  return { clock, toasts, stored, paths, run }
}

const start = ($: any) => $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })

describe('xyra-alert', () => {
  test('pairs once with the code in Xyra, then announces the match up to the game', async ($, on) => {
    const { toasts, stored, paths, run } = engine(on, {
      states: [IDLE, FOUND, PICKING, PLAYING],
      autoAccept: true,
      isOpen: true,
      language: 'English',
    })
    await start($)
    await run()
    expect(paths.filter(path => path.endsWith('/api/pair'))).toEqual(['POST /api/pair'])
    expect(stored.token).toBe(TOKEN)
    expect(toasts).toEqual(['Match found!', 'Xyra accepted it. Champion select.', 'The game started: Jinx.'])
  })

  test('says the match was accepted, in Spanish, when Xyra does not accept on its own', async ($, on) => {
    const { toasts, run } = engine(on, { states: [IDLE, FOUND, PICKING], autoAccept: false, isOpen: true, language: 'Español' })
    await start($)
    await run()
    expect(toasts).toEqual(['¡Partida encontrada!', 'Partida aceptada. Selección de campeón.'])
  })

  test('says nothing of what it finds when the session starts', async ($, on) => {
    const { toasts, run } = engine(on, { states: [PLAYING], autoAccept: true, isOpen: true, language: 'English' })
    await start($)
    await run()
    expect(toasts).toEqual([])
  })

  test('waits quietly while Xyra is closed and picks up once it opens', async ($, on) => {
    const xyra = { states: [IDLE, FOUND], autoAccept: true, isOpen: false, language: 'English' }
    const { clock, toasts, paths, run } = engine(on, xyra)
    await start($)
    await run()
    expect(paths).toEqual([])
    xyra.isOpen = true
    await clock.advance(RETRY_MS)
    await run()
    expect(toasts).toEqual(['Match found!'])
  })

  test('forgets its key and stops when Xyra no longer knows it', async ($, on) => {
    const { clock, stored, paths, toasts, run } = engine(on, { states: [IDLE, FOUND], autoAccept: true, isOpen: true, language: 'English' })
    stored.token = 'removed-device'
    await start($)
    await run()
    expect(stored.token).toBeUndefined()
    await clock.advance(RETRY_MS * 2)
    expect(paths).toEqual(['GET /api/state'])
    expect(toasts).toEqual([])
  })
})
