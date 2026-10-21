import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { MailBusy, MailFilter, MailMessage, MailProblem, MailSummary } from '../types'
import { bannerSvgOf } from './art'
import { ICONS } from './icons'
import { LAYOUT } from './layout'
import { localeOf, translate } from './locales'
import type { Locale, MessageKey } from './locales'
import { isWatched, jsonObjectsOf, messageOf, pageOf, relativeTimeOf, sizeOf, watchListOf } from './mail'
import { DEFAULT_THEME, PALETTE, THEMES, isTheme } from './palette'
import type { ThemeName } from './palette'

const PANE = 'mail-pane'
const COMMAND = 'mail'
const OPEN_TOOL = 'open'
const OPEN_CALLED = 'mcp__mail-pane__open'
const OPEN_DESCRIPTION =
  'Opens the mail pane beside the chat, with the latest mail from the configured sender domain. Call it when the person asks to see their mail.'
const DEFAULT_CONNECTOR = 'claude.ai Microsoft 365'
const SEARCH_TOOL = 'outlook_email_search'
const READ_TOOL = 'read_resource'
const MINUTE_MS = 60_000
const STORE = { theme: 'theme', seenUntil: 'seenUntil' }

const mails = atom({ plugin: 'mail-pane', key: 'mails' } as const, [] as MailSummary[])
const nextOffset = atom({ plugin: 'mail-pane', key: 'nextOffset' } as const, null as number | null)
const query = atom({ plugin: 'mail-pane', key: 'query' } as const, '')
const filter = atom({ plugin: 'mail-pane', key: 'filter' } as const, 'all' as MailFilter)
const message = atom({ plugin: 'mail-pane', key: 'message' } as const, null as MailMessage | null)
const isThreadShown = atom({ plugin: 'mail-pane', key: 'isThreadShown' } as const, false)
const busy = atom({ plugin: 'mail-pane', key: 'busy' } as const, null as MailBusy | null)
const problem = atom({ plugin: 'mail-pane', key: 'problem' } as const, null as MailProblem | null)
const theme = atom({ plugin: 'mail-pane', key: 'theme' } as const, DEFAULT_THEME as string)
const now = atom({ plugin: 'mail-pane', key: 'now' } as const, 0)

type Config = { domain: string; watch: string[]; refreshMs: number; connector: string }

let locale: Promise<Locale> | undefined

const textOption = (value: unknown, fallback = '') => (typeof value === 'string' && value.trim() ? value.trim() : fallback)

export const configOf = (options: Record<string, unknown>): Config => ({
  domain: textOption(options.domain),
  watch: watchListOf(textOption(options.watch)),
  refreshMs:
    (typeof options.refreshMinutes === 'number' && options.refreshMinutes > 0 ? options.refreshMinutes : LAYOUT.refreshMinutes) *
    MINUTE_MS,
  connector: textOption(options.connector, DEFAULT_CONNECTOR),
})

export const searchArgsOf = (config: Config, words: string, offset: number) => ({
  ...(config.domain ? { sender: config.domain } : {}),
  ...(words ? { query: words } : { order: 'newest' }),
  limit: LAYOUT.pageSize,
  offset,
})

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

async function setProblem($: EngineInterface, next: MailProblem | null) {
  await update($, problem, () => next)
}

async function setBusy($: EngineInterface, next: MailBusy | null) {
  await update($, busy, () => next)
}

async function call($: EngineInterface, config: Config, tool: string, args: Record<string, unknown>) {
  const answer = await $.mcp.call(config.connector, tool, args)
  if (answer.isError) throw new Error(tool)
  return answer.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('')
}

async function announce($: EngineInterface, config: Config, list: MailSummary[]) {
  const seenUntil = Number(await $.store.get(STORE.seenUntil)) || 0
  const newest = Math.max(seenUntil, ...list.map(mail => mail.receivedMs))
  if (seenUntil > 0) {
    const current = await localeFor($)
    const fresh = list.filter(mail => mail.receivedMs > seenUntil && isWatched(mail, config.watch)).slice(0, LAYOUT.toastsAtOnce)
    for (const mail of fresh) await $.ui.toast(translate(current, 'newMail', { who: mail.fromName, subject: mail.subject }))
  }
  if (newest !== seenUntil) await $.store.set(STORE.seenUntil, newest)
}

async function loadMails($: EngineInterface, config: Config, isMore = false) {
  const words = await read($, query)
  const offset = isMore ? ((await read($, nextOffset)) ?? 0) : 0
  await setBusy($, isMore ? 'more' : 'list')
  const text = await call($, config, SEARCH_TOOL, searchArgsOf(config, words, offset)).catch(() => undefined)
  await setBusy($, null)
  const checkedMs = await $.clock.now()
  await update($, now, () => checkedMs)
  if (text === undefined) return setProblem($, { key: 'connectorFailed' })
  const page = pageOf(text)
  await update($, mails, current =>
    isMore ? [...current, ...page.mails.filter(mail => !current.some(known => known.uri === mail.uri))] : page.mails,
  )
  await update($, nextOffset, () => page.nextOffset)
  await setProblem($, null)
  if (!isMore && !words) await announce($, config, page.mails)
}

async function search($: EngineInterface, config: Config, words: string) {
  await update($, query, () => words.trim())
  await update($, filter, (): MailFilter => 'all')
  await loadMails($, config)
}

async function openMail($: EngineInterface, config: Config, mail: MailSummary) {
  await update($, isThreadShown, () => false)
  await update($, message, () => ({ ...mail, to: [], cc: [], body: '', thread: '', attachments: [] }))
  await setBusy($, 'mail')
  const text = await call($, config, READ_TOOL, { uri: mail.uri }).catch(() => undefined)
  await setBusy($, null)
  const raw = text === undefined ? undefined : jsonObjectsOf(text)[0]
  if (!raw) {
    await update($, message, () => null)
    return setProblem($, { key: 'mailFailed' })
  }
  await update($, message, current => (current?.uri === mail.uri ? messageOf(raw, mail.uri) : current))
}

async function closeMail($: EngineInterface) {
  await update($, message, () => null)
  await update($, isThreadShown, () => false)
}

async function toggleThread($: EngineInterface) {
  await update($, isThreadShown, value => !value)
}

async function chooseFilter($: EngineInterface, next: MailFilter) {
  await update($, filter, () => next)
}

async function passToChat($: EngineInterface, mail: MailMessage, surface: 'terminal' | 'desktop' | 'vscode' | 'mobile') {
  const current = await localeFor($)
  const text = translate(current, 'chatText', {
    who: `${mail.fromName} <${mail.from}>`,
    when: relativeTimeOf(current, mail.receivedMs, await $.clock.now()),
    subject: mail.subject,
    body: mail.body,
  })
  const filled = await $.prompt.fill({ text, mode: 'insert' }).catch(() => undefined)
  if (filled?.isFilled) return
  const copied = await $.ui.copy({ text, surface }).catch(() => undefined)
  if (copied?.isCopied) {
    await $.ui.toast(translate(current, 'copied'))
    return
  }
  await setProblem($, { key: 'chatFailed' })
}

async function chooseTheme($: EngineInterface, name: string) {
  if (!isTheme(name)) return
  await update($, theme, () => name)
  await $.store.set(STORE.theme, name)
}

async function loadTheme($: EngineInterface) {
  const saved = await $.store.get(STORE.theme)
  if (isTheme(saved)) await update($, theme, () => saved)
}

export const register: Register = (on, options) => {
  const config = configOf(options)
  const openOnStart = options.openOnStart !== false
  let refresher: { cancel: () => void } | undefined
  locale = undefined

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await setBusy($, null)
    const current = await localeFor($)
    await $.command.register({ name: COMMAND, description: translate(current, 'commandDescription') }).catch(() => {})
    await $.tool.register({ name: OPEN_TOOL, description: OPEN_DESCRIPTION }).catch(() => {})
    await loadTheme($).catch(() => {})
    void loadMails($, config).catch(() => {})
    refresher?.cancel()
    refresher = $.clock.every(config.refreshMs, () => void loadMails($, config).catch(() => {}))
    if (openOnStart) void openPane($).catch(() => {})
    return started
  })

  on('session.end', async ($, e, next) => {
    refresher?.cancel()
    refresher = undefined
    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    void loadMails($, config).catch(() => {})
    return { text: await openPane($) }
  })

  on('tool.call', { tool: OPEN_CALLED }, async $ => {
    void loadMails($, config).catch(() => {})
    return { result: await openPane($) }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Link, Markdown, Text } = $.ui.resolve(e)
    const current = await localeFor($)
    const t = (key: MessageKey, values?: Record<string, string>) => translate(current, key, values)
    const heading = (key: MessageKey) => (
      <Text bold dimColor>
        {t(key).toLocaleUpperCase(current)}
      </Text>
    )
    const [list, more, words, chosen, opened, isWhole, loading, issue, painted, nowMs] = await Promise.all([
      read($, mails),
      read($, nextOffset),
      read($, query),
      read($, filter),
      read($, message),
      read($, isThreadShown),
      read($, busy),
      read($, problem),
      read($, theme),
      read($, now),
    ])
    const themeName = isTheme(painted) ? painted : DEFAULT_THEME
    const accent = THEMES[themeName]
    const unread = list.filter(mail => !mail.isRead)
    const shown = chosen === 'unread' ? unread : list
    const when = (receivedMs: number) => relativeTimeOf(current, receivedMs, nowMs || receivedMs)
    const subtitle = t('bannerLine', {
      source: config.domain || t('inbox'),
      unread: t('unreadCount', { count: String(unread.length) }),
    })

    const banner = () => {
      if (e.surface === 'terminal') {
        return (
          <Box flexDirection="column">
            <Text bold color={accent}>
              {t('title')}
            </Text>
            <Text dimColor>{subtitle}</Text>
          </Box>
        )
      }
      const { Svg } = $.ui.resolve(e)
      return <Svg source={bannerSvgOf(t('title'), subtitle, accent)} alt={`${t('title')} · ${subtitle}`} />
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

    const row = (mail: MailSummary) => {
      const details = [when(mail.receivedMs), mail.hasAttachments ? t('attachment') : ''].filter(Boolean).join(' · ')
      return (
        <Button key={`mail:${mail.uri}`} plain onPress={() => openMail($, config, mail)}>
          {mail.isRead ? <Text>{`${ICONS.read} `}</Text> : <Text color={accent}>{`${ICONS.unread} `}</Text>}
          <Text bold={!mail.isRead}>{mail.fromName}</Text>
          <Text>{`  ${mail.subject}`}</Text>
          <Text dimColor>{`  ${details}`}</Text>
        </Button>
      )
    }

    const themes = (
      <Box flexDirection="row" alignItems="center" gap={LAYOUT.buttonGap}>
        <Text dimColor>{t('theme')}</Text>
        {(Object.keys(THEMES) as ThemeName[]).map(name => (
          <Button key={`theme:${name}`} plain onPress={() => chooseTheme($, name)}>
            <Text color={THEMES[name]}>{name === themeName ? ICONS.themeChosen : ICONS.themeOther}</Text>
          </Button>
        ))}
      </Box>
    )

    if (opened) {
      const isReading = loading === 'mail'
      const text = (isWhole ? opened.thread : opened.body).slice(0, LAYOUT.threadCharacters)
      return (
        <Box flexDirection="column" gap={LAYOUT.sectionGap}>
          <Box flexDirection="row" flexWrap="wrap" alignItems="center" gap={LAYOUT.buttonGap}>
            <Button key="back" label={`${ICONS.back} ${t('back')}`} onPress={() => closeMail($)} />
            {!isReading && (
              <Button key="toChat" onPress={() => passToChat($, opened, e.surface)}>
                <Text bold color={accent}>
                  {t('toChat')}
                </Text>
              </Button>
            )}
            {opened.webLink && <Link href={opened.webLink} label={t('outlook')} />}
          </Box>
          {issue && <Text color={PALETTE.problem}>{t(issue.key, issue.values)}</Text>}
          <Box flexDirection="column">
            <Text bold>{opened.subject}</Text>
            <Text dimColor>{t('fromLine', { who: `${opened.fromName} <${opened.from}>`, when: when(opened.receivedMs) })}</Text>
            {opened.to.length > 0 && <Text dimColor>{t('toLine', { who: opened.to.join(', ') })}</Text>}
            {opened.cc.length > 0 && <Text dimColor>{t('ccLine', { who: opened.cc.join(', ') })}</Text>}
          </Box>
          {isReading ? <Text dimColor>{t('loading')}</Text> : <Markdown key="body" text={text || t('noBody')} />}
          {!isReading && opened.thread !== opened.body && (
            <Button key="thread" plain onPress={() => toggleThread($)}>
              <Text color={accent}>{isWhole ? t('hideThread') : t('showThread')}</Text>
            </Button>
          )}
          {opened.attachments.length > 0 && (
            <Box flexDirection="column">
              {heading('attachmentsHeading')}
              {opened.attachments.map(one => (
                <Text dimColor>{`${one.name} · ${sizeOf(current, one.size)}`}</Text>
              ))}
            </Box>
          )}
          {themes}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={LAYOUT.sectionGap}>
        {banner()}
        {searchField()}
        {words && (
          <Box flexDirection="row" alignItems="center" gap={LAYOUT.buttonGap}>
            <Text dimColor>{t('resultsFor', { query: words })}</Text>
            <Button key="clear" plain onPress={() => search($, config, '')}>
              <Text color={accent}>{t('clear')}</Text>
            </Button>
          </Box>
        )}
        <Box flexDirection="row" flexWrap="wrap" alignItems="center" gap={LAYOUT.buttonGap}>
          <Button
            key="filter:all"
            label={t('all')}
            variant={chosen === 'all' ? 'primary' : 'secondary'}
            onPress={() => chooseFilter($, 'all')}
          />
          <Button
            key="filter:unread"
            label={t('unreadCount', { count: String(unread.length) })}
            variant={chosen === 'unread' ? 'primary' : 'secondary'}
            onPress={() => chooseFilter($, 'unread')}
          />
          <Button key="refresh" plain onPress={() => loadMails($, config)}>
            <Text color={accent}>{t('refresh')}</Text>
          </Button>
        </Box>
        {loading === 'list' && <Text dimColor>{t('loading')}</Text>}
        {issue && <Text color={PALETTE.problem}>{t(issue.key, issue.values)}</Text>}
        {shown.length > 0 ? (
          <Box flexDirection="column">{shown.map(row)}</Box>
        ) : (
          loading !== 'list' && <Text dimColor>{t('empty')}</Text>
        )}
        {more !== null && chosen === 'all' && (
          <Button key="more" label={loading === 'more' ? t('loading') : t('more')} onPress={() => loadMails($, config, true)} />
        )}
        {themes}
      </Box>
    )
  })
}
