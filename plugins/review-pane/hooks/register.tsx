import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ReviewBusy, ReviewCheck, ReviewDetail, ReviewHost, ReviewItem, ReviewProblem, ReviewProject } from '../types'
import { bannerSvgOf } from './art'
import { ICONS } from './icons'
import { LAYOUT } from './layout'
import { localeOf, translate } from './locales'
import type { Locale, MessageKey } from './locales'
import { DEFAULT_THEME, PALETTE, THEMES, isTheme } from './palette'
import type { ThemeName } from './palette'
import {
  GITHUB_DETAIL_FIELDS,
  GITHUB_PROJECT_QUERY,
  GITHUB_QUERY,
  GITLAB_LISTS,
  GITLAB_PROJECTS_PATH,
  GITLAB_USER_PATH,
  ROLES,
  diffCommandOf,
  githubDetailOf,
  githubItemsOf,
  githubProjectsOf,
  githubSearchesOf,
  gitlabDetailOf,
  gitlabItemsOf,
  gitlabLoginOf,
  gitlabProjectItemsOf,
  gitlabProjectPathsOf,
  gitlabProjectsOf,
  projectOf,
  referenceOf,
  relativeTimeOf,
  seenAfter,
} from './reviews'

const PANE = 'review-pane'
const COMMAND = 'reviews'
const OPEN_TOOL = 'open'
const OPEN_CALLED = 'mcp__review-pane__open'
const OPEN_DESCRIPTION =
  'Opens the review pane beside the chat, with the GitHub pull requests and GitLab merge requests that involve the person, or those of one project they pick. Call it when the person asks to see their pull requests, merge requests or pending reviews.'
const HOSTS: ReviewHost[] = ['github', 'gitlab']
const ALL = 'all'
const MINUTE_MS = 60_000
const STORE = { theme: 'theme', seenReviews: 'seenReviews', project: 'project' }

const items = atom({ plugin: 'review-pane', key: 'items' } as const, [] as ReviewItem[])
const failed = atom({ plugin: 'review-pane', key: 'failed' } as const, [] as ReviewHost[])
const projects = atom({ plugin: 'review-pane', key: 'projects' } as const, [] as ReviewProject[])
const project = atom({ plugin: 'review-pane', key: 'project' } as const, null as ReviewProject | null)
const projectItems = atom({ plugin: 'review-pane', key: 'projectItems' } as const, [] as ReviewItem[])
const isProjectFailed = atom({ plugin: 'review-pane', key: 'isProjectFailed' } as const, false)
const opened = atom({ plugin: 'review-pane', key: 'opened' } as const, null as ReviewItem | null)
const detail = atom({ plugin: 'review-pane', key: 'detail' } as const, null as ReviewDetail | null)
const busy = atom({ plugin: 'review-pane', key: 'busy' } as const, null as ReviewBusy | null)
const problem = atom({ plugin: 'review-pane', key: 'problem' } as const, null as ReviewProblem | null)
const theme = atom({ plugin: 'review-pane', key: 'theme' } as const, DEFAULT_THEME as string)
const now = atom({ plugin: 'review-pane', key: 'now' } as const, 0)

type Config = { hosts: ReviewHost[]; gh: string; glab: string; refreshMs: number }

type Surface = 'terminal' | 'desktop' | 'vscode' | 'mobile'

type HostLoad = { items: ReviewItem[]; projects: ReviewProject[] }

let locale: Promise<Locale> | undefined
let gitlabLogin: Promise<string> | undefined

const textOption = (value: unknown, fallback: string) => (typeof value === 'string' && value.trim() ? value.trim() : fallback)

export const configOf = (options: Record<string, unknown>): Config => ({
  hosts: HOSTS.filter(host => options[host] !== false),
  gh: textOption(options.gh, 'gh'),
  glab: textOption(options.glab, 'glab'),
  refreshMs:
    (typeof options.refreshMinutes === 'number' && options.refreshMinutes > 0 ? options.refreshMinutes : LAYOUT.refreshMinutes) *
    MINUTE_MS,
})

export const githubArgsOf = (config: Config, path?: string) => [
  config.gh,
  'api',
  'graphql',
  '-f',
  `query=${path ? GITHUB_PROJECT_QUERY : GITHUB_QUERY}`,
  ...Object.entries(githubSearchesOf(path)).flatMap(([name, value]) => ['-f', `${name}=${value}`]),
  '-F',
  `first=${LAYOUT.pageSize}`,
  '-F',
  `recent=${LAYOUT.recentCount}`,
  ...(path ? [] : ['-F', `repos=${LAYOUT.projectsFetched}`]),
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

function loginOf($: EngineInterface, config: Config) {
  gitlabLogin ??= output($, [config.glab, 'api', GITLAB_USER_PATH]).then(gitlabLoginOf)
  gitlabLogin.catch(() => (gitlabLogin = undefined))
  return gitlabLogin
}

async function githubLoad($: EngineInterface, config: Config): Promise<HostLoad> {
  const answer = await output($, githubArgsOf(config))
  return { items: githubItemsOf(answer), projects: githubProjectsOf(answer) }
}

async function gitlabLoad($: EngineInterface, config: Config): Promise<HostLoad> {
  const [answers, listed] = await Promise.all([
    Promise.all(GITLAB_LISTS.map(async list => ({ role: list.role, json: await output($, [config.glab, 'api', list.path]) }))),
    output($, [config.glab, 'api', GITLAB_PROJECTS_PATH]),
  ])
  return { items: gitlabItemsOf(answers), projects: gitlabProjectsOf(listed) }
}

async function hostLoad($: EngineInterface, config: Config, host: ReviewHost) {
  const loading = host === 'github' ? githubLoad($, config) : gitlabLoad($, config)
  return loading.catch(() => undefined)
}

async function projectLoad($: EngineInterface, config: Config, chosen: ReviewProject) {
  if (chosen.host === 'github') return githubItemsOf(await output($, githubArgsOf(config, chosen.path)), 'others')
  if (!chosen.id) throw new Error(chosen.key)
  const [me, answers] = await Promise.all([
    loginOf($, config),
    Promise.all(gitlabProjectPathsOf(chosen.id).map(path => output($, [config.glab, 'api', path]))),
  ])
  return gitlabProjectItemsOf(answers, me)
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

async function loadProject($: EngineInterface, config: Config) {
  const chosen = await read($, project)
  if (!chosen || !config.hosts.includes(chosen.host)) return
  await setBusy($, 'project')
  const found = await projectLoad($, config, chosen).catch(() => undefined)
  await setBusy($, null)
  if ((await read($, project))?.key !== chosen.key) return
  await update($, isProjectFailed, () => !found)
  if (found) await update($, projectItems, () => found)
}

async function loadReviews($: EngineInterface, config: Config) {
  await setBusy($, 'list')
  const results = await Promise.all(config.hosts.map(host => hostLoad($, config, host)))
  await setBusy($, null)
  const checkedMs = await $.clock.now()
  await update($, now, () => checkedMs)
  const failedHosts = config.hosts.filter((_host, at) => !results[at])
  const loaded = results.flatMap(result => result?.items ?? [])
  await update($, failed, () => failedHosts)
  await update($, items, current => [...current.filter(item => failedHosts.includes(item.host)), ...loaded])
  await update($, projects, current => [
    ...current.filter(one => failedHosts.includes(one.host)),
    ...results.flatMap(result => result?.projects ?? []),
  ])
  await announce($, loaded)
  await loadProject($, config)
}

async function chooseProject($: EngineInterface, config: Config, key: string) {
  const listed = await read($, projects)
  const chosen = key === ALL ? null : (listed.find(one => one.key === key) ?? null)
  await update($, project, () => chosen)
  await update($, projectItems, () => [])
  await update($, isProjectFailed, () => false)
  await $.store.set(STORE.project, chosen)
  await loadProject($, config)
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

async function loadKept($: EngineInterface, config: Config) {
  const [keptTheme, keptProject] = await Promise.all([$.store.get(STORE.theme), $.store.get(STORE.project)])
  if (isTheme(keptTheme)) await update($, theme, () => keptTheme)
  const chosen = projectOf(keptProject)
  if (chosen && config.hosts.includes(chosen.host)) await update($, project, () => chosen)
}

export const register: Register = (on, options) => {
  const config = configOf(options)
  const openOnStart = options.openOnStart !== false
  let refresher: { cancel: () => void } | undefined
  locale = undefined
  gitlabLogin = undefined

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await setBusy($, null)
    const current = await localeFor($)
    await $.command.register({ name: COMMAND, description: translate(current, 'commandDescription') }).catch(() => {})
    await $.tool.register({ name: OPEN_TOOL, description: OPEN_DESCRIPTION }).catch(() => {})
    await loadKept($, config).catch(() => {})
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
    const heading = (text: string) => (
      <Text bold dimColor>
        {text.toLocaleUpperCase(current)}
      </Text>
    )
    const [list, failedHosts, listed, chosen, chosenItems, isChosenFailed, item, shownDetail, loading, issue, painted, nowMs] =
      await Promise.all([
        read($, items),
        read($, failed),
        read($, projects),
        read($, project),
        read($, projectItems),
        read($, isProjectFailed),
        read($, opened),
        read($, detail),
        read($, busy),
        read($, problem),
        read($, theme),
        read($, now),
      ])
    const themeName = isTheme(painted) ? painted : DEFAULT_THEME
    const accent = THEMES[themeName]
    const shownItems = chosen ? chosenItems : list
    const open = shownItems.filter(one => one.state === 'open')
    const subtitle = t('bannerLine', {
      lead: chosen ? chosen.path : t('reviewCount', { count: String(open.filter(one => one.role === 'review').length) }),
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

    const section = (host: ReviewHost, title: string, own: ReviewItem[], failure?: MessageKey) => {
      const groups = ROLES.map(role => {
        const rows = own.filter(one => one.role === role && (role === 'recent') === (one.state !== 'open'))
        return { role, rows: role === 'recent' ? rows.slice(0, LAYOUT.recentCount) : rows }
      }).filter(group => group.rows.length > 0)
      const isEmpty = !failure && !loading && !own.some(one => one.state === 'open')
      return (
        <Box key={`host:${host}`} flexDirection="column">
          {heading(title)}
          {failure && <Text color={PALETTE.problem}>{t(failure)}</Text>}
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

    const projectLabel = (one: ReviewProject) =>
      [t(one.host), one.path, one.openCount ? t('openCount', { count: String(one.openCount) }) : ''].filter(Boolean).join(' · ')

    const picker = () => {
      const choices = chosen && !listed.some(one => one.key === chosen.key) ? [chosen, ...listed] : listed
      if (choices.length === 0) return null
      if (e.surface === 'mobile') {
        const shortList = [...(chosen ? [chosen] : []), ...choices.filter(one => one.key !== chosen?.key)].slice(0, LAYOUT.mobileProjects)
        return (
          <Box flexDirection="row" flexWrap="wrap" gap={LAYOUT.buttonGap}>
            <Button key={`project:${ALL}`} label={t('allProjects')} variant={chosen ? 'secondary' : 'primary'} onPress={() => chooseProject($, config, ALL)} />
            {shortList.map(one => (
              <Button
                key={`project:${one.key}`}
                label={projectLabel(one)}
                variant={one.key === chosen?.key ? 'primary' : 'secondary'}
                onPress={() => chooseProject($, config, one.key)}
              />
            ))}
          </Box>
        )
      }
      const { Select } = $.ui.resolve(e)
      return (
        <Select
          key="project"
          label={t('project')}
          value={chosen?.key ?? ALL}
          options={[{ value: ALL, label: t('allProjects') }, ...choices.map(one => ({ value: one.key, label: projectLabel(one) }))]}
          onSelect={value => void chooseProject($, config, value)}
        />
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
              {heading(t('checksHeading'))}
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
              {heading(t('reviewersHeading'))}
              <Text>{shown.reviewers.map(one => (one.decision === 'none' ? one.who : `${one.who} (${t(one.decision)})`)).join(', ')}</Text>
            </Box>
          )}
          {shown && <Markdown key="body" text={shown.body.slice(0, LAYOUT.bodyCharacters) || t('noBody')} />}
          {themes}
        </Box>
      )
    }

    const sections = chosen
      ? [section(chosen.host, `${t(chosen.host)} · ${chosen.path}`, chosenItems, isChosenFailed ? 'projectFailed' : undefined)]
      : config.hosts.map(host =>
          section(
            host,
            t(host),
            list.filter(one => one.host === host),
            failedHosts.includes(host) ? (host === 'github' ? 'githubFailed' : 'gitlabFailed') : undefined,
          ),
        )

    return (
      <Box flexDirection="column" gap={LAYOUT.sectionGap}>
        {banner()}
        <Box flexDirection="row" alignItems="center" gap={LAYOUT.buttonGap}>
          <Button key="refresh" plain onPress={() => loadReviews($, config)}>
            <Text color={accent}>{t('refresh')}</Text>
          </Button>
          {loading && loading !== 'detail' && <Text dimColor>{t('loading')}</Text>}
        </Box>
        {picker()}
        {sections}
        {themes}
      </Box>
    )
  })
}
