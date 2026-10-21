import type {
  ReviewCheck,
  ReviewCheckRun,
  ReviewDecision,
  ReviewDetail,
  ReviewItem,
  ReviewReviewer,
  ReviewRole,
  ReviewState,
} from '../types'
import { LAYOUT } from './layout'

type Raw = Record<string, unknown>

export const ROLES: ReviewRole[] = ['review', 'mine', 'assigned', 'involved', 'recent']

export const GITHUB_QUERY = [
  'query($review: String!, $open: String!, $closed: String!, $first: Int!, $recent: Int!) {',
  'viewer { login }',
  'review: search(type: ISSUE, query: $review, first: $first) { nodes { ...pr } }',
  'open: search(type: ISSUE, query: $open, first: $first) { nodes { ...pr } }',
  'closed: search(type: ISSUE, query: $closed, first: $recent) { nodes { ...pr } }',
  '}',
  'fragment pr on PullRequest {',
  'number title url state isDraft reviewDecision mergeable updatedAt',
  'repository { nameWithOwner } author { login }',
  'commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }',
  '}',
].join(' ')

export const GITHUB_SEARCHES = {
  review: 'is:pr is:open archived:false review-requested:@me',
  open: 'is:pr is:open archived:false involves:@me',
  closed: 'is:pr is:closed archived:false involves:@me sort:updated-desc',
}

export const GITHUB_DETAIL_FIELDS = 'body,additions,deletions,changedFiles,baseRefName,headRefName,statusCheckRollup,reviewRequests,latestReviews'

export const GITLAB_LISTS: { role: ReviewRole; path: string }[] = [
  { role: 'review', path: `merge_requests?scope=reviews_for_me&state=opened&per_page=${LAYOUT.gitlabPageSize}` },
  { role: 'mine', path: `merge_requests?scope=created_by_me&state=opened&per_page=${LAYOUT.gitlabPageSize}` },
  { role: 'assigned', path: `merge_requests?scope=assigned_to_me&state=opened&per_page=${LAYOUT.gitlabPageSize}` },
  { role: 'recent', path: `merge_requests?scope=created_by_me&state=all&order_by=updated_at&per_page=${LAYOUT.recentFetched}` },
]

const GITHUB_STATES: Record<string, ReviewState> = { OPEN: 'open', MERGED: 'merged', CLOSED: 'closed' }
const GITHUB_CHECKS: Record<string, ReviewCheck> = {
  SUCCESS: 'passing',
  FAILURE: 'failing',
  ERROR: 'failing',
  PENDING: 'pending',
  EXPECTED: 'pending',
}
const GITHUB_DECISIONS: Record<string, ReviewDecision> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes',
  REVIEW_REQUIRED: 'waiting',
}
const CHECK_RUN_FAILURES = ['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE']
const COMPLETED = 'COMPLETED'
const STATUS_CONTEXT = 'StatusContext'
const GITLAB_STATES: Record<string, ReviewState> = { opened: 'open', merged: 'merged', closed: 'closed', locked: 'closed' }
const GITLAB_CHECKS: Record<string, ReviewCheck> = { ci_still_running: 'pending' }
const GITLAB_DECISIONS: Record<string, ReviewDecision> = { not_approved: 'waiting', requested_changes: 'changes' }
const GITLAB_PIPELINES: Record<string, ReviewCheck> = {
  success: 'passing',
  failed: 'failing',
  canceled: 'failing',
  running: 'pending',
  pending: 'pending',
  created: 'pending',
  preparing: 'pending',
  scheduled: 'pending',
  manual: 'pending',
  waiting_for_resource: 'pending',
}
const CHECK_ORDER: ReviewCheck[] = ['failing', 'pending', 'passing', 'none']
const REFERENCE_SUFFIX = /!\d+$/
const CARRIAGE_RETURN = String.fromCharCode(13)
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['week', 604_800_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

const textOf = (value: unknown) => (typeof value === 'string' ? value : '')
const rawOf = (value: unknown): Raw => (value && typeof value === 'object' ? (value as Raw) : {})
const listOf = (value: unknown) => (Array.isArray(value) ? value.map(rawOf) : [])
const bodyOf = (value: unknown) => textOf(value).replaceAll(CARRIAGE_RETURN, '').trim()

export const mergedOf = (items: ReviewItem[]) => items.filter((item, at) => items.findIndex(other => other.key === item.key) === at)

function githubItemOf(node: Raw, role: ReviewRole): ReviewItem | undefined {
  const url = textOf(node.url)
  if (!url) return undefined
  const commit = rawOf(listOf(rawOf(node.commits).nodes)[0]?.commit)
  return {
    key: url,
    host: 'github',
    role,
    repo: textOf(rawOf(node.repository).nameWithOwner),
    number: Number(node.number) || 0,
    title: textOf(node.title),
    author: textOf(rawOf(node.author).login),
    url,
    updatedMs: Date.parse(textOf(node.updatedAt)) || 0,
    state: GITHUB_STATES[textOf(node.state)] ?? 'open',
    isDraft: node.isDraft === true,
    hasConflicts: node.mergeable === 'CONFLICTING',
    check: GITHUB_CHECKS[textOf(rawOf(commit.statusCheckRollup).state)] ?? 'none',
    decision: GITHUB_DECISIONS[textOf(node.reviewDecision)] ?? 'none',
  }
}

export function githubItemsOf(json: string): ReviewItem[] {
  const data = rawOf(rawOf(JSON.parse(json)).data)
  const me = textOf(rawOf(data.viewer).login)
  const nodesOf = (alias: keyof typeof GITHUB_SEARCHES) => listOf(rawOf(data[alias]).nodes)
  return mergedOf([
    ...nodesOf('review').flatMap(node => githubItemOf(node, 'review') ?? []),
    ...nodesOf('open').flatMap(node => githubItemOf(node, textOf(rawOf(node.author).login) === me ? 'mine' : 'involved') ?? []),
    ...nodesOf('closed').flatMap(node => githubItemOf(node, 'recent') ?? []),
  ])
}

function gitlabItemOf(raw: Raw, role: ReviewRole): ReviewItem | undefined {
  const url = textOf(raw.web_url)
  const number = Number(raw.iid) || 0
  if (!url || !number) return undefined
  const status = textOf(raw.detailed_merge_status)
  return {
    key: url,
    host: 'gitlab',
    role,
    repo: textOf(rawOf(raw.references).full).replace(REFERENCE_SUFFIX, ''),
    number,
    title: textOf(raw.title),
    author: textOf(rawOf(raw.author).username),
    url,
    updatedMs: Date.parse(textOf(raw.updated_at)) || 0,
    state: GITLAB_STATES[textOf(raw.state)] ?? 'open',
    isDraft: raw.draft === true,
    hasConflicts: raw.has_conflicts === true,
    check: GITLAB_CHECKS[status] ?? 'none',
    decision: GITLAB_DECISIONS[status] ?? 'none',
    projectId: Number(raw.project_id) || undefined,
  }
}

export const gitlabItemsOf = (answers: { role: ReviewRole; json: string }[]) =>
  mergedOf(answers.flatMap(({ role, json }) => listOf(JSON.parse(json)).flatMap(raw => gitlabItemOf(raw, role) ?? [])))

const sortedChecks = (checks: ReviewCheckRun[]) =>
  [...checks].sort((a, b) => CHECK_ORDER.indexOf(a.state) - CHECK_ORDER.indexOf(b.state))

function githubCheckOf(raw: Raw): ReviewCheck {
  if (raw.__typename === STATUS_CONTEXT) return GITHUB_CHECKS[textOf(raw.state)] ?? 'none'
  if (textOf(raw.status) !== COMPLETED) return 'pending'
  return CHECK_RUN_FAILURES.includes(textOf(raw.conclusion)) ? 'failing' : 'passing'
}

export function githubDetailOf(json: string, key: string): ReviewDetail {
  const raw = rawOf(JSON.parse(json))
  const reviewed: ReviewReviewer[] = listOf(raw.latestReviews).map(review => ({
    who: textOf(rawOf(review.author).login),
    decision: GITHUB_DECISIONS[textOf(review.state)] ?? 'none',
  }))
  const requested: ReviewReviewer[] = listOf(raw.reviewRequests).map(request => ({
    who: textOf(request.login) || textOf(request.name) || textOf(request.slug),
    decision: 'waiting',
  }))
  return {
    key,
    body: bodyOf(raw.body),
    base: textOf(raw.baseRefName),
    head: textOf(raw.headRefName),
    additions: Number(raw.additions) || 0,
    deletions: Number(raw.deletions) || 0,
    files: Number(raw.changedFiles) || 0,
    checks: sortedChecks(
      listOf(raw.statusCheckRollup).map(check => ({
        name: textOf(check.name) || textOf(check.context),
        state: githubCheckOf(check),
        url: textOf(check.detailsUrl) || textOf(check.targetUrl) || undefined,
      })),
    ),
    reviewers: [...reviewed, ...requested].filter(one => one.who),
  }
}

export function gitlabDetailOf(json: string, key: string, pipelineName: string): ReviewDetail {
  const raw = rawOf(JSON.parse(json))
  const pipeline = rawOf(raw.head_pipeline)
  const status = textOf(pipeline.status)
  return {
    key,
    body: bodyOf(raw.description),
    base: textOf(raw.target_branch),
    head: textOf(raw.source_branch),
    files: parseInt(textOf(raw.changes_count), 10) || 0,
    checks: status ? [{ name: pipelineName, state: GITLAB_PIPELINES[status] ?? 'none', url: textOf(pipeline.web_url) || undefined }] : [],
    reviewers: listOf(raw.reviewers).flatMap(one => (textOf(one.username) ? [{ who: textOf(one.username), decision: 'none' as const }] : [])),
  }
}

export const referenceOf = (item: Pick<ReviewItem, 'host' | 'number'>) => `${item.host === 'github' ? '#' : '!'}${item.number}`

export const diffCommandOf = (item: Pick<ReviewItem, 'host' | 'number' | 'repo'>) =>
  item.host === 'github' ? `gh pr diff ${item.number} --repo ${item.repo}` : `glab mr diff ${item.number} --repo ${item.repo}`

export const seenAfter = (seen: readonly string[], keys: readonly string[]) => [...new Set([...keys, ...seen])].slice(0, LAYOUT.seenLimit)

export function relativeTimeOf(locale: string, thenMs: number, nowMs: number) {
  const gap = thenMs - nowMs
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const unit = UNITS.find(([, size]) => Math.abs(gap) >= size)
  return unit ? format.format(Math.round(gap / unit[1]), unit[0]) : format.format(0, 'minute')
}
