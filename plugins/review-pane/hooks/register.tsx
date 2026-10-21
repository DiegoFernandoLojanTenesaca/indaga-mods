import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ReviewBusy, ReviewCheck, ReviewDetail, ReviewHost, ReviewItem, ReviewProblem } from '../types'
import { bannerSvgOf } from './art'
import { ICONS } from './icons'
import { LAYOUT } from './layout'
import { localeOf, translate } from './locales'
import type { Locale, MessageKey } from './locales'
import { DEFAULT_THEME, PALETTE, THEMES, isTheme } from './palette'
import type { ThemeName } from './palette'
import {
  GITHUB_DETAIL_FIELDS,
  GITHUB_QUERY,
  GITHUB_SEARCHES,
  GITLAB_LISTS,
  ROLES,
  diffCommandOf,
  githubDetailOf,
  githubItemsOf,
  gitlabDetailOf,
  gitlabItemsOf,
  referenceOf,
  relativeTimeOf,
  seenAfter,
} from './reviews'

const PANE = 'review-pane'
const COMMAND = 'reviews'
const OPEN_TOOL = 'open'
const OPEN_CALLED = 'mcp__review-pane__open'
const OPEN_DESCRIPTION =
  'Opens the review pane beside the chat, with the GitHub pull requests and GitLab merge requests that involve the person. Call it when the person asks to see their pull requests, merge requests or pending reviews.'
const HOSTS: ReviewHost[] = ['github', 'gitlab']
const MINUTE_MS = 60_000
const STORE = { theme: 'theme', seenReviews: 'seenReviews' }

const items = atom({ plugin: 'review-pane', key: 'items' } as const, [] as ReviewItem[])
const failed = atom({ plugin: 'review-pane', key: 'failed' } as const, [] as ReviewHost[])
const opened = atom({ plugin: 'review-pane', key: 'opened' } as const, null as ReviewItem | null)
const detail = atom({ plugin: 'review-pane', key: 'detail' } as const, null as ReviewDetail | null)
const busy = atom({ plugin: 'review-pane', key: 'busy' } as const, null as ReviewBusy | null)
const problem = atom({ plugin: 'review-pane', key: 'problem' } as const, null as ReviewProblem | null)
const theme = atom({ plugin: 'review-pane', key: 'theme' } as const, DEFAULT_THEME as string)
const now = atom({ plugin: 'review-pane', key: 'now' } as const, 0)

type Config = { hosts: ReviewHost[]; gh: string; glab: string; refreshMs: number }

type Surface = 'terminal' | 'desktop' | 'vscode' | 'mobile'

let locale: Promise<Locale> | undefined

const textOption = (value: unknown, fallback: string) => (typeof value === 'string' && value.trim() ? value.trim() : fallback)

export const configOf = (options: Record<string, unknown>): Config => ({
  hosts: HOSTS.filter(host => options[host] !== false),
  gh: textOption(options.gh, 'gh'),
  glab: textOption(options.glab, 'glab'),
  refreshMs:
    (typeof options.refreshMinutes === 'number' && options.refreshMinutes > 0 ? options.refreshMinutes : LAYOUT.refreshMinutes) *
    MINUTE_MS,
})

export const githubArgsOf = (config: Config) => [
  config.gh,
  'api',
  'graphql',
  '-f',
  `query=${GITHUB_QUERY}`,
  ...Object.entries(GITHUB_SEARCHES).flatMap(([name, value]) => ['-f', `${name}=${value}`]),
  '-F',
  `first=${LAYOUT.pageSize}`,
  '-F',
  `recent=${LAYOUT.recentCount}`,
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

async function setProblem($: EngineInterface, next: ReviewProblem | null) {
  await update($, problem, () => next)
}

async function setBusy($: EngineInterface, next: ReviewBusy | null) {
  await update($, busy, () => next)
}

async function output($: EngineInterface, argv: string[]) {
  const done = await $.process.run(argv, { timeoutMs: LAYOUT.processTimeoutMs })
  if (done.exitCode !== 0) throw new Error(argv[0])
  return done.stdout
}

async function githubItems($: EngineInterface, config: Config) {
  return githubItemsOf(await output($, githubArgsOf(config)))
}

async function gitlabItems($: EngineInterface, config: Config) {
  const answers = await Promise.all(
    GITLAB_LISTS.map(async list => ({ role: list.role, json: await output($, [config.glab, 'api', list.path]) })),
  )
  return gitlabItemsOf(answers)
}

async function hostItems($: EngineInterface, config: Config, host: ReviewHost) {
  const loading = host === 'github' ? githubItems($, config) : gitlabItems($, config)
  return loading.catch(() => undefined)
}

async function announce($: EngineInterface, list: ReviewItem[]) {
  const kept = await $.store.get(STORE.seenReviews)
  const seen = Array.isArray(kept) ? kept.filter((key): key is string => typeof key === 'string') : undefined
  const asked = list.filter(item => item.role === 'review')
  const fresh = asked.filter(item => !seen?.includes(item.key))
  if (seen) {
    const current = await localeFor($)
    for (const item of fresh.slice(0, LAYOUT.toastsAtOnce)) {
      await $.ui.toast(translate(current, 'newReview', { who: item.author, repo: item.repo, reference: referenceOf(item), title: item.title }))
    }
  }
  if (!seen || fresh.length > 0) await $.store.set(STORE.seenReviews, seenAfter(seen ?? [], asked.map(item => item.key)))
}

async function loadReviews($: EngineInterface, config: Config) {
  await setBusy($, 'list')
  const results = await Promise.all(config.hosts.map(host => hostItems($, config, host)))
  await setBusy($, null)
  const checkedMs = await $.clock.now()
  await update($, now, () => checkedMs)
  const failedHosts = config.hosts.filter((_host, at) => !results[at])
  const loaded = results.flatMap(result => result ?? [])
  await update($, failed, () => failedHosts)
  await update($, items, current => [...current.filter(item => failedHosts.includes(item.host)), ...loaded])
  await announce($, loaded)
}

async function readDetail($: EngineInterface, config: Config, item: ReviewItem) {
  if (item.host === 'github') return githubDetailOf(await output($, [config.gh, 'pr', 'view', item.url, '--json', GITHUB_DETAIL_FIELDS]), item.key)
  if (!item.projectId) throw new Error(item.key)
  const current = await localeFor($)
  const answer = await output($, [config.glab, 'api', `projects/${item.projectId}/merge_requests/${item.number}`])
  return gitlabDetailOf(answer, item.key, translate(current, 'pipeline'))
}

async function openItem($: EngineInterface, config: Config, item: ReviewItem) {
  await setProblem($, null)
  await update($, opened, () => item)
  await update($, detail, () => null)
  await setBusy($, 'detail')
  const found = await readDetail($, config, item).catch(() => undefined)
  await setBusy($, null)
  if (!found) return setProblem($, { key: 'detailFailed' })
  await update($, detail, () => found)
}

async function closeItem($: EngineInterface) {
  await update($, opened, () => null)
  await update($, detail, () => null)
  await setProblem($, null)
}

async function passToChat($: EngineInterface, item: ReviewItem, surface: Surface) {
  const current = await localeFor($)
  const text = translate(current, 'chatText', {
    kind: translate(current, item.host === 'github' ? 'pullRequest' : 'mergeRequest'),
    repo: item.repo,
    reference: referenceOf(item),
    title: item.title,
    url: item.url,
    diff: diffCommandOf(item),
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
    void loadReviews($, config).catch(() => {})
    refresher?.cancel()
    refresher = $.clock.every(config.refreshMs, () => void loadReviews($, config).catch(() => {}))
    if (openOnStart) void openPane($).catch(() => {})
    return started
  })

  on('session.end', async ($, e, next) => {
    refresher?.cancel()
    refresher = undefined
    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    void loadReviews($, config).catch(() => {})
    return { text: await openPane($) }
  })

  on('tool.call', { tool: OPEN_CALLED }, async $ => {
    void loadReviews($, config).catch(() => {})
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
    const [list, failedHosts, item, shownDetail, loading, issue, painted, nowMs] = await Promise.all([
      read($, items),
      read($, failed),
      read($, opened),
      read($, detail),
      read($, busy),
      read($, problem),
      read($, theme),
      read($, now),
    ])
    const themeName = isTheme(painted) ? painted : DEFAULT_THEME
    const accent = THEMES[themeName]
    const open = list.filter(one => one.state === 'open')
    const subtitle = t('bannerLine', {
      review: t('reviewCount', { count: String(open.filter(one => one.role === 'review').length) }),
      open: t('openCount', { count: String(open.length) }),
    })
    const problemLine = issue && <Text color={PALETTE.problem}>{t(issue.key)}</Text>
    const when = (updatedMs: number) => relativeTimeOf(current, updatedMs, nowMs || updatedMs)

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

    const mark = (check: ReviewCheck) =>
      check === 'none' ? <Text>{`${ICONS.none} `}</Text> : <Text color={PALETTE[check]}>{`${ICONS[check]} `}</Text>

    const detailsOf = (one: ReviewItem) =>
      [
        t('byLine', { who: one.author }),
        when(one.updatedMs),
        one.state !== 'open' ? t(one.state) : '',
        one.isDraft ? t('draft') : '',
        one.decision !== 'none' ? t(one.decision) : '',
        one.hasConflicts ? t('conflicts') : '',
      ]
        .filter(Boolean)
        .join(' · ')

    const row = (one: ReviewItem) => (
      <Button key={`item:${one.key}`} plain onPress={() => openItem($, config, one)}>
        {mark(one.check)}
        <Text dimColor>{`${one.repo}${referenceOf(one)}  `}</Text>
        <Text bold={one.role === 'review'}>{one.title}</Text>
        <Text dimColor>{`  ${detailsOf(one)}`}</Text>
      </Button>
    )

    const section = (host: ReviewHost) => {
      const own = list.filter(one => one.host === host)
      const groups = ROLES.map(role => {
        const rows = own.filter(one => one.role === role && (role === 'recent') === (one.state !== 'open'))
        return { role, rows: role === 'recent' ? rows.slice(0, LAYOUT.recentCount) : rows }
      }).filter(group => group.rows.length > 0)
      const isFailed = failedHosts.includes(host)
      const isEmpty = !isFailed && loading !== 'list' && !own.some(one => one.state === 'open')
      return (
        <Box key={`host:${host}`} flexDirection="column">
          {heading(host)}
          {isFailed && <Text color={PALETTE.problem}>{t(host === 'github' ? 'githubFailed' : 'gitlabFailed')}</Text>}
          {isEmpty && <Text dimColor>{t('empty')}</Text>}
          {groups.map(group => (
            <Box key={`group:${host}:${group.role}`} flexDirection="column">
              <Text dimColor>{t(group.role)}</Text>
              {group.rows.map(row)}
            </Box>
          ))}
        </Box>
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

    if (item) {
      const shown = shownDetail?.key === item.key ? shownDetail : null
      const changes =
        shown &&
        (shown.additions === undefined
          ? t('filesLine', { files: String(shown.files) })
          : t('diffLine', { additions: String(shown.additions), deletions: String(shown.deletions ?? 0), files: String(shown.files) }))
      return (
        <Box flexDirection="column" gap={LAYOUT.sectionGap}>
          <Box flexDirection="row" flexWrap="wrap" alignItems="center" gap={LAYOUT.buttonGap}>
            <Button key="back" label={`${ICONS.back} ${t('back')}`} onPress={() => closeItem($)} />
            <Button key="toChat" onPress={() => passToChat($, item, e.surface)}>
              <Text bold color={accent}>
                {t('toChat')}
              </Text>
            </Button>
            <Link href={item.url} label={t(item.host === 'github' ? 'openGithub' : 'openGitlab')} />
          </Box>
          {problemLine}
          <Box flexDirection="column">
            <Text bold>{item.title}</Text>
            <Text dimColor>{`${item.repo}${referenceOf(item)} · ${detailsOf(item)}`}</Text>
            {shown && <Text dimColor>{t('branches', { base: shown.base, head: shown.head })}</Text>}
            {changes && <Text dimColor>{changes}</Text>}
          </Box>
          {loading === 'detail' && <Text dimColor>{t('loading')}</Text>}
          {shown && shown.checks.length > 0 && (
            <Box flexDirection="column">
              {heading('checksHeading')}
              {shown.checks.slice(0, LAYOUT.checksShown).map((check, at) => (
                <Box key={`check:${at}`} flexDirection="row" alignItems="center">
                  {mark(check.state)}
                  {check.url ? <Link href={check.url} label={check.name} /> : <Text>{check.name}</Text>}
                  {check.state !== 'none' && <Text dimColor>{`  ${t(check.state)}`}</Text>}
                </Box>
              ))}
            </Box>
          )}
          {shown && shown.reviewers.length > 0 && (
            <Box flexDirection="column">
              {heading('reviewersHeading')}
              <Text>{shown.reviewers.map(one => (one.decision === 'none' ? one.who : `${one.who} (${t(one.decision)})`)).join(', ')}</Text>
            </Box>
          )}
          {shown && <Markdown key="body" text={shown.body.slice(0, LAYOUT.bodyCharacters) || t('noBody')} />}
          {themes}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={LAYOUT.sectionGap}>
        {banner()}
        <Box flexDirection="row" alignItems="center" gap={LAYOUT.buttonGap}>
          <Button key="refresh" plain onPress={() => loadReviews($, config)}>
            <Text color={accent}>{t('refresh')}</Text>
          </Button>
          {loading === 'list' && <Text dimColor>{t('loading')}</Text>}
        </Box>
        {config.hosts.map(section)}
        {themes}
      </Box>
    )
  })
}
