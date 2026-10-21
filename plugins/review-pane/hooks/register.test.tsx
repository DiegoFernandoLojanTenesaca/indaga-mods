import { describe, expect, mock, test } from 'claude-code/testing'
import type { Mounted } from 'claude-code/testing'

import { ICONS } from './icons'
import { PALETTE, THEMES } from './palette'

const PANE = {
  component: 'Pane',
  requestId: 'review-pane',
  props: { title: 'Reviews', isFocused: true, bodyColumns: 80, placement: 'dock' },
}
const NOW = Date.UTC(2026, 9, 21, 12)
const HOUR_MS = 3_600_000
const SCOPE = /scope=(\w+)&state=(\w+)/

const prUrl = (number: number) => `https://github.example/acme/app/pull/${number}`
const MR_URL = 'https://gitlab.example/team/api/-/merge_requests/3'

const pr = (number: number, author: string, hoursAgo: number, extra: Record<string, unknown> = {}) => ({
  number,
  title: `Change ${number}`,
  url: prUrl(number),
  state: 'OPEN',
  isDraft: false,
  reviewDecision: null,
  mergeable: 'MERGEABLE',
  updatedAt: new Date(NOW - hoursAgo * HOUR_MS).toISOString(),
  repository: { nameWithOwner: 'acme/app' },
  author: { login: author },
  commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] },
  ...extra,
})

const ASKED = pr(12, 'ana', 1, { title: 'Fix the cache', reviewDecision: 'REVIEW_REQUIRED' })
const MINE = pr(9, 'me', 3, { title: 'Add the export', commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } }] } })
const MERGED = pr(4, 'me', 30, { title: 'Old work', state: 'MERGED' })
const MR = {
  iid: 3,
  project_id: 77,
  title: 'Speed up the import',
  state: 'opened',
  draft: true,
  has_conflicts: false,
  detailed_merge_status: 'draft_status',
  references: { full: 'team/api!3' },
  author: { username: 'luis' },
  updated_at: new Date(NOW - 2 * HOUR_MS).toISOString(),
  web_url: MR_URL,
}
const PR_DETAIL = {
  body: 'Keeps the cache **warm**.',
  additions: 57,
  deletions: 3,
  changedFiles: 2,
  baseRefName: 'develop',
  headRefName: 'fix/cache',
  latestReviews: [{ author: { login: 'luis' }, state: 'APPROVED' }],
  reviewRequests: [{ login: 'me' }],
  statusCheckRollup: [
    { __typename: 'CheckRun', name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS', detailsUrl: 'https://ci.example/1' },
    { __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: 'https://ci.example/2' },
  ],
}
const MR_DETAIL = {
  description: '',
  target_branch: 'main',
  source_branch: 'perf/import',
  changes_count: '4',
  head_pipeline: { status: 'running', web_url: 'https://gitlab.example/pipelines/5' },
  reviewers: [{ username: 'ana' }],
}

type World = {
  github: { review: unknown[]; open: unknown[]; closed: unknown[] } | 'down'
  gitlab: Record<'review' | 'mine' | 'assigned' | 'recent', unknown[]> | 'down'
  fills?: boolean
}

const pause = () => new Promise(done => (globalThis as any).setTimeout(done, 5))
const until = async (check: () => Promise<unknown>) => {
  for (let i = 0; i < 400 && !(await check()); i++) await pause()
}

const gitlabListOf = (path: string) => {
  const [, scope, state] = SCOPE.exec(path) ?? []
  if (scope === 'reviews_for_me') return 'review'
  if (scope === 'assigned_to_me') return 'assigned'
  return state === 'all' ? 'recent' : 'mine'
}

function engine(on: any, world: World) {
  const clock = mock.clock(on, { now: NOW })
  const runs: string[][] = []
  const toasts: string[] = []
  const fills: string[] = []
  const copies: string[] = []
  const opened: string[] = []
  const stored: Record<string, unknown> = {}
  const ok = (stdout: unknown) => ({ value: { exitCode: 0, stdout: JSON.stringify(stdout), stderr: '' } })
  const down = { value: { exitCode: 1, stdout: '', stderr: 'not signed in' } }
  on('session.start', (_$: any, e: any) => ({ sessionId: 's', cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: `mcp__review-pane__${e.name}` } }))
  on('settings.read', () => ({ value: { language: 'English' } }))
  on('store.get', (_$: any, e: any) => ({ value: stored[e.key] }))
  on('store.set', (_$: any, e: any) => ((stored[e.key] = e.value), { value: undefined }))
  on('ui.open', (_$: any, e: any) => (opened.push(e.id), { value: { isPlaced: true } }))
  on('ui.toast', (_$: any, e: any) => (toasts.push(e.text), { value: undefined }))
  on('prompt.fill', (_$: any, e: any) => (fills.push(e.text), { isFilled: world.fills !== false }))
  on('ui.copy', (_$: any, e: any) => (copies.push(e.text), { value: { isCopied: true } }))
  on('process.run', (_$: any, e: any) => {
    const argv: string[] = e.argv
    runs.push(argv)
    if (argv[0] === 'gh' && argv[2] === 'graphql') {
      return world.github === 'down' ? down : ok({ data: { viewer: { login: 'me' }, ...Object.fromEntries(Object.entries(world.github).map(([alias, nodes]) => [alias, { nodes }])) } })
    }
    if (argv[0] === 'gh' && argv[1] === 'pr') return ok(PR_DETAIL)
    if (argv[0] === 'glab' && argv[2]?.startsWith('projects/')) return ok(MR_DETAIL)
    if (argv[0] === 'glab') return world.gitlab === 'down' ? down : ok(world.gitlab[gitlabListOf(argv[2] ?? '')])
    return down
  })
  return { clock, runs, toasts, fills, copies, opened, stored }
}

const WORLD = (): World => ({
  github: { review: [ASKED], open: [ASKED, MINE], closed: [MERGED] },
  gitlab: { review: [], mine: [], assigned: [MR], recent: [] },
})

async function startPane($: any, surface: 'terminal' | 'desktop' = 'desktop') {
  await $.session.start({ surface, isInteractive: true, cwd: '/work' })
  return (await $.ui.mount({ plugin: 'review-pane', surface, ...PANE })) as Mounted<'desktop'>
}

describe('review-pane', () => {
  test('opens the pane at start, and again when Claude calls its tool', async ($, on) => {
    const { opened } = engine(on, WORLD())
    await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' } as any)
    await until(async () => opened.length === 1)
    expect(await $.tool.call({ tool: 'mcp__review-pane__open' } as any)).toMatchObject({ result: 'Review pane opened.' })
    expect(opened).toEqual(['review-pane', 'review-pane'])
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`lists the GitHub and GitLab requests by what they ask of you, on ${surface}`, async ($, on) => {
      const { runs } = engine(on, WORLD())
      const pane = await startPane($, surface)
      await until(() => pane.find({ key: `item:${MR_URL}` }))
      expect(runs.find(argv => argv[2] === 'graphql')).toEqual(expect.arrayContaining(['-f', 'review=is:pr is:open archived:false review-requested:@me', '-F', 'first=30']))
      expect(runs.filter(argv => argv[0] === 'glab').map(argv => argv[2])).toEqual([
        'merge_requests?scope=reviews_for_me&state=opened&per_page=50',
        'merge_requests?scope=created_by_me&state=opened&per_page=50',
        'merge_requests?scope=assigned_to_me&state=opened&per_page=50',
        'merge_requests?scope=created_by_me&state=all&order_by=updated_at&per_page=10',
      ])
      expect(await pane.find({ key: `item:${prUrl(12)}`, text: /acme\/app#12.*Fix the cache.*by ana · 1 hour ago · review pending/ })).toBeDefined()
      expect(await pane.find({ key: `item:${prUrl(9)}`, text: new RegExp(`${ICONS.failing}.*Add the export`) })).toBeDefined()
      expect(await pane.find({ key: `item:${prUrl(4)}`, text: /Old work.*merged/ })).toBeDefined()
      expect(await pane.find({ key: `item:${MR_URL}`, text: /team\/api!3.*Speed up the import.*by luis · 2 hours ago · draft/ })).toBeDefined()
      for (const label of ['GITHUB', 'GITLAB', 'Asked to review', 'Yours', 'Closed lately', 'Assigned to you']) {
        expect(await pane.find({ type: 'Text', text: label })).toBeDefined()
      }
      expect(await pane.find({ type: 'Text', text: ICONS.failing + ' ' })).toMatchObject({ props: { color: PALETTE.failing } })
      if (surface === 'terminal') expect(await pane.find({ type: 'Text', text: '1 to review · 3 open' })).toBeDefined()
      else expect(await pane.findAll({ type: 'Svg' })).toHaveLength(1)
      await pane.unmount()
    })
  }

  test('opens a pull request with its checks, reviewers and description, and goes back', async ($, on) => {
    const { runs } = engine(on, WORLD())
    const pane = await startPane($)
    await until(() => pane.find({ key: `item:${prUrl(12)}` }))
    await pane.press({ key: `item:${prUrl(12)}` })
    expect(runs.at(-1)?.slice(0, 4)).toEqual(['gh', 'pr', 'view', prUrl(12)])
    expect(await pane.find({ type: 'Text', text: 'Fix the cache' })).toMatchObject({ props: { bold: true } })
    expect(await pane.find({ type: 'Text', text: 'develop ← fix/cache' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '+57 −3 · 2 files' })).toBeDefined()
    expect(await pane.findAll({ type: 'Link' })).toEqual([
      expect.objectContaining({ props: expect.objectContaining({ href: prUrl(12), label: 'Open in GitHub' }) }),
      expect.objectContaining({ props: expect.objectContaining({ href: 'https://ci.example/2', label: 'test' }) }),
      expect.objectContaining({ props: expect.objectContaining({ href: 'https://ci.example/1', label: 'build' }) }),
    ])
    expect(await pane.find({ type: 'Text', text: 'luis (approved), me (review pending)' })).toBeDefined()
    expect(await pane.find({ key: 'body' })).toMatchObject({ props: { text: 'Keeps the cache **warm**.' } })
    await pane.press({ key: 'back' })
    expect(await pane.find({ key: `item:${prUrl(12)}` })).toBeDefined()
  })

  test('opens a merge request with its pipeline', async ($, on) => {
    const { runs } = engine(on, WORLD())
    const pane = await startPane($)
    await until(() => pane.find({ key: `item:${MR_URL}` }))
    await pane.press({ key: `item:${MR_URL}` })
    expect(runs.at(-1)).toEqual(['glab', 'api', 'projects/77/merge_requests/3'])
    expect(await pane.find({ type: 'Text', text: 'main ← perf/import' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '4 files' })).toBeDefined()
    expect(await pane.find({ type: 'Link', text: 'Pipeline' })).toMatchObject({ props: { href: 'https://gitlab.example/pipelines/5' } })
    expect(await pane.find({ type: 'Text', text: '  running' })).toBeDefined()
    expect(await pane.find({ key: 'body' })).toMatchObject({ props: { text: 'No description.' } })
  })

  test('passes a request to the chat to review it, or copies it where the prompt cannot be filled', async ($, on) => {
    const world = WORLD()
    const { fills, copies, toasts } = engine(on, world)
    const pane = await startPane($)
    await until(() => pane.find({ key: `item:${prUrl(12)}` }))
    await pane.press({ key: `item:${prUrl(12)}` })
    await pane.press({ key: 'toChat' })
    expect(fills).toEqual([
      [
        'Review the pull request acme/app#12: Fix the cache',
        prUrl(12),
        '',
        'Read its changes with `gh pr diff 12 --repo acme/app` and tell me what you would change, file by file.',
      ].join('\n'),
    ])
    world.fills = false
    await pane.press({ key: 'toChat' })
    expect(copies).toEqual([fills[1]])
    expect(toasts).toEqual(['The request was copied: paste it in the chat.'])
  })

  test('says which host did not answer and keeps the other', async ($, on) => {
    engine(on, { ...WORLD(), github: 'down' })
    const pane = await startPane($)
    await until(() => pane.find({ key: `item:${MR_URL}` }))
    expect(await pane.find({ type: 'Text', text: /^GitHub did not answer/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'Nothing open.' })).toBeUndefined()
  })

  test('says when nothing is open', async ($, on) => {
    engine(on, { github: { review: [], open: [], closed: [] }, gitlab: { review: [], mine: [], assigned: [], recent: [] } })
    const pane = await startPane($)
    await until(async () => (await pane.findAll({ type: 'Text', text: 'Nothing open.' })).length === 2)
    expect(await pane.findAll({ type: 'Text', text: 'Nothing open.' })).toHaveLength(2)
  })

  test('raises a toast when someone asks for your review, after the first look', async ($, on) => {
    const world = WORLD()
    const { clock, toasts, stored, runs } = engine(on, world)
    const pane = await startPane($)
    await until(() => pane.find({ key: `item:${prUrl(12)}` }))
    expect(toasts).toEqual([])
    expect(stored.seenReviews).toEqual([prUrl(12)])
    const asked = pr(20, 'eva', 0.1, { title: 'Rename the tables' })
    world.github = { review: [asked, ASKED], open: [asked, ASKED, MINE], closed: [MERGED] }
    const before = runs.length
    await clock.advance(5 * 60_000)
    await until(async () => runs.length > before && toasts.length > 0)
    expect(toasts).toEqual(['eva asks you to review acme/app#20: Rename the tables'])
    expect(stored.seenReviews).toEqual([prUrl(20), prUrl(12)])
    await pane.unmount()
  })

  test('leaves GitLab out when its option is off', { options: { gitlab: false } }, async ($, on) => {
    const { runs } = engine(on, WORLD())
    const pane = await startPane($)
    await until(() => pane.find({ key: `item:${prUrl(12)}` }))
    expect(runs.some(argv => argv[0] === 'glab')).toBe(false)
    expect(await pane.find({ type: 'Text', text: 'GITLAB' })).toBeUndefined()
  })

  test('picks a theme from its dots and keeps it', async ($, on) => {
    const { stored } = engine(on, WORLD())
    const pane = await startPane($)
    await until(() => pane.find({ key: 'theme:purple', text: ICONS.themeChosen }))
    await pane.press({ key: 'theme:green' })
    expect(stored.theme).toBe('green')
    expect(await pane.find({ type: 'Text', text: ICONS.themeChosen })).toMatchObject({ props: { color: THEMES.green } })
  })
})
