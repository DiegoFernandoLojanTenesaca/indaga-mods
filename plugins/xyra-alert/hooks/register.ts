import type { EngineInterface, Register } from 'claude-code'

import { alertsOf } from './alerts'
import type { XyraState } from './alerts'
import { localeOf, translate } from './locales'
import type { Locale } from './locales'

const DEFAULT_ADDRESS = 'http://127.0.0.1:47811'
const DEVICE_NAME = 'Claude Code'
const XYRA_CONFIG = ['com.indagalab.xyra', 'config.json']
const TOKEN_KEY = 'token'
const NEXT_MS = 1
const RETRY_MS = 30_000
const FORBIDDEN = 403

type Config = { address: string }
type Timer = { cancel: () => void }
type StateAnswer = { version: number; state: XyraState }

const configOf =(options: Record<string, unknown>): Config => ({
  address: (typeof options.address === 'string' && options.address.trim() ? options.address.trim() : DEFAULT_ADDRESS).replace(/\/+$/, ''),
})

const joinPath = (folder: string, names: readonly string[]) => [folder.replace(/[\\/]+$/, ''), ...names].join(folder.includes('\\') ? '\\' : '/')

const linkOf = (config: Config, path: string, token: string, extra = '') =>
  `${config.address}${path}?t=${encodeURIComponent(token)}${extra}`

async function sessionLocale($: EngineInterface): Promise<Locale> {
  const language = await $.settings.read({ key: 'language' }).catch(() => undefined)
  return localeOf(typeof language === 'string' ? language : undefined)
}

async function pairingCode($: EngineInterface) {
  const folder = await $.env.get('APPDATA')
  if (!folder) return undefined
  const saved = JSON.parse(await $.fs.read(joinPath(folder, XYRA_CONFIG))) as { phone_token?: unknown }
  return typeof saved.phone_token === 'string' && saved.phone_token ? saved.phone_token : undefined
}

async function tokenOf($: EngineInterface, config: Config) {
  const kept = await $.store.get(TOKEN_KEY)
  if (typeof kept === 'string' && kept) return kept
  const code = await pairingCode($)
  if (!code) return undefined
  const paired = await $.http.fetch(linkOf(config, '/api/pair', code, `&name=${encodeURIComponent(DEVICE_NAME)}`), { method: 'POST' })
  const token = paired.ok ? (JSON.parse(paired.text) as { token?: unknown }).token : undefined
  if (typeof token !== 'string' || !token) return undefined
  await $.store.set(TOKEN_KEY, token)
  return token
}

async function acceptsAlone($: EngineInterface, config: Config, token: string) {
  const settings = await $.http.fetch(linkOf(config, '/api/settings', token))
  return settings.ok && (JSON.parse(settings.text) as { auto_accept?: unknown }).auto_accept === true
}

function watch($: EngineInterface, config: Config): Timer {
  let timer: Timer | undefined
  let seen: XyraState | undefined
  let version: number | undefined
  let locale: Locale | undefined

  const schedule = (ms: number) => {
    timer = $.clock.after(ms, () => void step().catch(() => schedule(RETRY_MS)))
  }

  const step = async () => {
    const token = await tokenOf($, config)
    if (!token) return schedule(RETRY_MS)
    const answer = await $.http.fetch(linkOf(config, '/api/state', token, version === undefined ? '' : `&after=${version}`))
    if (answer.status === FORBIDDEN) return $.store.delete(TOKEN_KEY)
    if (!answer.ok) return schedule(RETRY_MS)
    const latest = JSON.parse(answer.text) as StateAnswer
    locale ??= await sessionLocale($)
    for (const alert of seen ? alertsOf(seen, latest.state) : []) {
      const key = alert.key === 'accepted' && (await acceptsAlone($, config, token)) ? 'acceptedByXyra' : alert.key
      $.ui.toast(translate(locale, key, alert.values))
    }
    seen = latest.state
    version = latest.version
    schedule(NEXT_MS)
  }

  schedule(NEXT_MS)
  return { cancel: () => timer?.cancel() }
}

export const register: Register = (on, options) => {
  const config = configOf(options)
  let watcher: Timer | undefined

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    watcher?.cancel()
    watcher = watch($, config)
    return started
  })

  on('session.end', async ($, e, next) => {
    watcher?.cancel()
    watcher = undefined
    return next(e)
  })
}
