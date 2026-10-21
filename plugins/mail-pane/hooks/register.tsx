import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type {
  MailAttachment,
  MailBusy,
  MailFilter,
  MailMessage,
  MailPreview,
  MailProblem,
  MailSaved,
  MailSummary,
} from '../types'
import { bannerSvgOf, imageSvgOf } from './art'
import { ICONS } from './icons'
import { LAYOUT } from './layout'
import { localeOf, translate } from './locales'
import type { Locale, MessageKey } from './locales'
import {
  contentOf,
  dayOf,
  isImage,
  isWatched,
  joinPath,
  jsonObjectsOf,
  messageOf,
  pageOf,
  relativeTimeOf,
  safeNameOf,
  sizeOf,
  watchListOf,
} from './mail'
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
const DOWNLOADS = 'Downloads'
const WINDOWS = 'Windows_NT'
const DECODE_SCRIPT = 'base64 --decode < "$0" > "$1"'
const MARKDOWN_NAME = /\.(md|markdown)$/i

const mails = atom({ plugin: 'mail-pane', key: 'mails' } as const, [] as MailSummary[])
const nextOffset = atom({ plugin: 'mail-pane', key: 'nextOffset' } as const, null as number | null)
const query = atom({ plugin: 'mail-pane', key: 'query' } as const, '')
const filter = atom({ plugin: 'mail-pane', key: 'filter' } as const, 'all' as MailFilter)
const message = atom({ plugin: 'mail-pane', key: 'message' } as const, null as MailMessage | null)
const isThreadShown = atom({ plugin: 'mail-pane', key: 'isThreadShown' } as const, false)
const preview = atom({ plugin: 'mail-pane', key: 'preview' } as const, null as MailPreview | null)
const saved = atom({ plugin: 'mail-pane', key: 'saved' } as const, null as MailSaved | null)
const busy = atom({ plugin: 'mail-pane', key: 'busy' } as const, null as MailBusy | null)
const problem = atom({ plugin: 'mail-pane', key: 'problem' } as const, null as MailProblem | null)
const theme = atom({ plugin: 'mail-pane', key: 'theme' } as const, DEFAULT_THEME as string)
const now = atom({ plugin: 'mail-pane', key: 'now' } as const, 0)

type Config = { domain: string; watch: string[]; refreshMs: number; connector: string; saveFolder: string }

type Surface = 'terminal' | 'desktop' | 'vscode' | 'mobile'

let locale: Promise<Locale> | undefined

const textOption = (value: unknown, fallback = '') => (typeof value === 'string' && value.trim() ? value.trim() : fallback)

export const configOf = (options: Record<string, unknown>): Config => ({
  domain: textOption(options.domain),
  watch: watchListOf(textOption(options.watch)),
  refreshMs:
    (typeof options.refreshMinutes === 'number' && options.refreshMinutes > 0 ? options.refreshMinutes : LAYOUT.refreshMinutes) *
    MINUTE_MS,
  connector: textOption(options.connector, DEFAULT_CONNECTOR),
  saveFolder: textOption(options.saveFolder),
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

async function callBlocks($: EngineInterface, config: Config, tool: string, args: Record<string, unknown>) {
  const answer = await $.mcp.call(config.connector, tool, args)
  if (answer.isError) throw new Error(tool)
  return answer.content
}

async function call($: EngineInterface, config: Config, tool: string, args: Record<string, unknown>) {
  const blocks = await callBlocks($, config, tool, args)
  return blocks.flatMap(block => (block.type === 'text' && block.text ? [block.text] : [])).join('')
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
  await update($, preview, () => null)
  await setProblem($, null)
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
  await update($, preview, () => null)
  await update($, isThreadShown, () => false)
}

async function toggleThread($: EngineInterface) {
  await update($, isThreadShown, value => !value)
}

async function chooseFilter($: EngineInterface, next: MailFilter) {
  await update($, filter, () => next)
}

async function readAttachment($: EngineInterface, config: Config, attachment: MailAttachment) {
  return contentOf(await callBlocks($, config, READ_TOOL, { uri: attachment.uri }))
}

async function viewAttachment($: EngineInterface, config: Config, attachment: MailAttachment) {
  await setProblem($, null)
  await setBusy($, 'attachment')
  const content = await readAttachment($, config, attachment).catch(() => undefined)
  await setBusy($, null)
  if (!content) return setProblem($, { key: 'attachmentFailed', values: { name: attachment.name } })
  const mimeType = 'data' in content ? content.mimeType || attachment.contentType : ''
  await update($, preview, (): MailPreview => ({
    name: attachment.name,
    text: 'text' in content ? content.text : undefined,
    image: 'data' in content && isImage(mimeType) ? { data: content.data, mimeType } : undefined,
  }))
}

async function closePreview($: EngineInterface) {
  await update($, preview, () => null)
}

async function tempFolderOf($: EngineInterface) {
  return (await $.env.get('TEMP')) ?? (await $.env.get('TMPDIR')) ?? '/tmp'
}

async function saveRootOf($: EngineInterface, config: Config, current: Locale) {
  if (config.saveFolder) return config.saveFolder
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? (await tempFolderOf($))
  return joinPath(joinPath(home, DOWNLOADS), translate(current, 'saveFolderName'))
}

async function writeBytes($: EngineInterface, base64: string, target: string) {
  const encoded = joinPath(await tempFolderOf($), `mail-pane-${safeNameOf(target).slice(-LAYOUT.tempNameLength)}.b64`)
  await $.fs.write(encoded, base64)
  const isWindows = (await $.env.get('OS')) === WINDOWS
  const argv = isWindows ? ['certutil', '-f', '-decode', encoded, target] : ['sh', '-c', DECODE_SCRIPT, encoded, target]
  const done = await $.process.run(argv, { timeoutMs: LAYOUT.decodeTimeoutMs })
  if (done.exitCode !== 0) throw new Error(target)
}

async function saveMail($: EngineInterface, config: Config, mail: MailMessage): Promise<MailSaved> {
  const known = await read($, saved)
  if (known?.uri === mail.uri) return known
  const current = await localeFor($)
  const t = (key: MessageKey, values?: Record<string, string>) => translate(current, key, values)
  const subject = safeNameOf(mail.subject) || t('noSubject')
  const folder = joinPath(await saveRootOf($, config, current), `${dayOf(mail.receivedMs)} ${subject}`)
  await setBusy($, 'save')
  const mailFile = t('mailFileName')
  await $.fs.write(
    joinPath(folder, mailFile),
    t('mailFile', {
      subject: mail.subject || t('noSubject'),
      who: `${mail.fromName} <${mail.from}>`,
      to: mail.to.join(', '),
      cc: mail.cc.join(', '),
      date: new Date(mail.receivedMs).toISOString(),
      body: mail.thread,
    }),
  )
  const files = [mailFile]
  const failed: string[] = []
  for (const attachment of mail.attachments) {
    const name = safeNameOf(attachment.name) || attachment.uri.slice(-LAYOUT.tempNameLength)
    const target = joinPath(folder, name)
    const written = await readAttachment($, config, attachment)
      .then(async content => {
        if (!content) throw new Error(name)
        if ('text' in content) await $.fs.write(target, content.text)
        else await writeBytes($, content.data, target)
      })
      .then(
        () => true,
        () => false,
      )
    if (written) files.push(name)
    else failed.push(attachment.name)
  }
  await setBusy($, null)
  const result = { uri: mail.uri, folder, files }
  await update($, saved, () => result)
  await setProblem($, failed.length > 0 ? { key: 'saveFailed', values: { names: failed.join(', ') } } : null)
  return result
}

async function passToChat($: EngineInterface, config: Config, mail: MailMessage, surface: Surface) {
  const current = await localeFor($)
  const kept = await saveMail($, config, mail).catch(() => undefined)
  const text = translate(current, 'chatText', {
    who: `${mail.fromName} <${mail.from}>`,
    when: relativeTimeOf(current, mail.receivedMs, await $.clock.now()),
    subject: mail.subject,
    body: mail.body,
    folder: kept?.folder ?? '',
    files: (kept?.files ?? []).map(name => `- ${name}`).join('\n'),
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
  const kept = await $.store.get(STORE.theme)
  if (isTheme(kept)) await update($, theme, () => kept)
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
    const { Box, Button, Code, Link, Markdown, Text } = $.ui.resolve(e)
    const current = await localeFor($)
    const t = (key: MessageKey, values?: Record<string, string>) => translate(current, key, values)
    const heading = (key: MessageKey) => (
      <Text bold dimColor>
        {t(key).toLocaleUpperCase(current)}
      </Text>
    )
    const [list, more, words, chosen, opened, isWhole, shownFile, kept, loading, issue, painted, nowMs] = await Promise.all([
      read($, mails),
      read($, nextOffset),
      read($, query),
      read($, filter),
      read($, message),
      read($, isThreadShown),
      read($, preview),
      read($, saved),
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
    const problemLine = issue && <Text color={PALETTE.problem}>{t(issue.key, issue.values)}</Text>

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

    const image = (file: MailPreview) => {
      if (!file.image) return null
      const source = imageSvgOf(file.image.data, file.image.mimeType)
      if (e.surface === 'terminal' || source.length > LAYOUT.svgCharacters) return <Text dimColor>{t('tooBig')}</Text>
      const { Svg } = $.ui.resolve(e)
      return <Svg source={source} alt={file.name} />
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

    if (opened && shownFile) {
      const text = (shownFile.text ?? '').slice(0, LAYOUT.threadCharacters)
      return (
        <Box flexDirection="column" gap={LAYOUT.sectionGap}>
          <Button key="closePreview" label={`${ICONS.back} ${t('closePreview')}`} onPress={() => closePreview($)} />
          <Text bold>{shownFile.name}</Text>
          {shownFile.image
            ? image(shownFile)
            : text
              ? MARKDOWN_NAME.test(shownFile.name)
                ? <Markdown key="file" text={text} />
                : <Code key="file" source={text} path={shownFile.name} />
              : <Text dimColor>{t('noPreview')}</Text>}
        </Box>
      )
    }

    if (opened) {
      const isReading = loading === 'mail'
      const text = (isWhole ? opened.thread : opened.body).slice(0, LAYOUT.threadCharacters)
      const isSaved = kept?.uri === opened.uri
      return (
        <Box flexDirection="column" gap={LAYOUT.sectionGap}>
          <Box flexDirection="row" flexWrap="wrap" alignItems="center" gap={LAYOUT.buttonGap}>
            <Button key="back" label={`${ICONS.back} ${t('back')}`} onPress={() => closeMail($)} />
            {!isReading && (
              <Button key="toChat" onPress={() => passToChat($, config, opened, e.surface)}>
                <Text bold color={accent}>
                  {t('toChat')}
                </Text>
              </Button>
            )}
            {!isReading && (
              <Button key="save" label={loading === 'save' ? t('saving') : t('save')} onPress={() => saveMail($, config, opened)} />
            )}
            {opened.webLink && <Link href={opened.webLink} label={t('outlook')} />}
          </Box>
          {problemLine}
          {isSaved && <Text dimColor>{t('savedIn', { folder: kept.folder })}</Text>}
          <Box flexDirection="column">
            <Text bold>{opened.subject}</Text>
            <Text dimColor>{t('fromLine', { who: `${opened.fromName} <${opened.from}>`, when: when(opened.receivedMs) })}</Text>
            {opened.to.length > 0 && <Text dimColor>{t('toLine', { who: opened.to.join(', ') })}</Text>}
            {opened.cc.length > 0 && <Text dimColor>{t('ccLine', { who: opened.cc.join(', ') })}</Text>}
          </Box>
          {opened.attachments.length > 0 && (
            <Box flexDirection="column">
              {heading('attachmentsHeading')}
              {opened.attachments.map(one => (
                <Box key={`attachment:${one.uri}`} flexDirection="row" alignItems="center" gap={LAYOUT.buttonGap}>
                  <Button key={`view:${one.uri}`} plain onPress={() => viewAttachment($, config, one)}>
                    <Text color={accent}>{t('view')}</Text>
                  </Button>
                  <Text>{one.name}</Text>
                  <Text dimColor>{sizeOf(current, one.size)}</Text>
                </Box>
              ))}
              {loading === 'attachment' && <Text dimColor>{t('loading')}</Text>}
            </Box>
          )}
          {isReading ? <Text dimColor>{t('loading')}</Text> : <Markdown key="body" text={text || t('noBody')} />}
          {!isReading && opened.thread !== opened.body && (
            <Button key="thread" plain onPress={() => toggleThread($)}>
              <Text color={accent}>{isWhole ? t('hideThread') : t('showThread')}</Text>
            </Button>
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
        {problemLine}
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
