import { describe, expect, test } from 'claude-code/testing'

import {
  diffCommandOf,
  githubDetailOf,
  githubItemsOf,
  gitlabDetailOf,
  gitlabItemsOf,
  referenceOf,
  relativeTimeOf,
  seenAfter,
} from './reviews'

const HOUR_MS = 3_600_000
const NOW = Date.UTC(2026, 9, 21, 12)

const pr = (number: number, author: string, extra: Record<string, unknown> = {}) => ({
  number,
  title: `Change ${number}`,
  url: `https://github.example/acme/app/pull/${number}`,
  state: 'OPEN',
  isDraft: false,
  reviewDecision: null,
  mergeable: 'MERGEABLE',
  updatedAt: new Date(NOW - number * HOUR_MS).toISOString(),
  repository: { nameWithOwner: 'acme/app' },
  author: { login: author },
  commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] },
  ...extra,
})

const mr = (iid: number, extra: Record<string, unknown> = {}) => ({
  iid,
  project_id: 77,
  title: `Merge ${iid}`,
  state: 'opened',
  draft: false,
  has_conflicts: false,
  detailed_merge_status: 'mergeable',
  references: { short: `!${iid}`, full: `team/api!${iid}` },
  author: { username: 'luis', name: 'Luis Mora' },
  updated_at: new Date(NOW - iid * HOUR_MS).toISOString(),
  web_url: `https://gitlab.example/team/api/-/merge_requests/${iid}`,
  ...extra,
})

describe('reviews', () => {
  test('reads the GitHub answer into roles, one row per pull request', () => {
    const answer = {
      data: {
        viewer: { login: 'me' },
        review: { nodes: [pr(1, 'ana', { reviewDecision: 'REVIEW_REQUIRED', isDraft: true })] },
        open: {
          nodes: [
            pr(1, 'ana'),
            pr(2, 'me', { reviewDecision: 'CHANGES_REQUESTED', mergeable: 'CONFLICTING', commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } }] } }),
            pr(3, 'luis', { commits: { nodes: [{ commit: { statusCheckRollup: null } }] } }),
          ],
        },
        closed: { nodes: [pr(4, 'me', { state: 'MERGED', reviewDecision: 'APPROVED' })] },
      },
    }
    const found = githubItemsOf(JSON.stringify(answer))
    expect(found.map(item => [item.number, item.role])).toEqual([
      [1, 'review'],
      [2, 'mine'],
      [3, 'involved'],
      [4, 'recent'],
    ])
    expect(found[0]).toMatchObject({ host: 'github', repo: 'acme/app', author: 'ana', isDraft: true, decision: 'waiting', check: 'passing', state: 'open' })
    expect(found[1]).toMatchObject({ check: 'failing', decision: 'changes', hasConflicts: true })
    expect(found[2]).toMatchObject({ check: 'none', decision: 'none' })
    expect(found[3]).toMatchObject({ state: 'merged', decision: 'approved', updatedMs: NOW - 4 * HOUR_MS })
  })

  test('reads the GitLab lists, the first list that holds a merge request deciding its role', () => {
    const found = gitlabItemsOf([
      { role: 'review', json: JSON.stringify([mr(5, { detailed_merge_status: 'not_approved' })]) },
      { role: 'mine', json: JSON.stringify([mr(6, { draft: true, detailed_merge_status: 'ci_still_running' })]) },
      { role: 'assigned', json: JSON.stringify([mr(5), mr(7, { has_conflicts: true })]) },
      { role: 'recent', json: JSON.stringify([mr(6), mr(8, { state: 'merged' }), { title: 'no link' }]) },
    ])
    expect(found.map(item => [item.number, item.role])).toEqual([
      [5, 'review'],
      [6, 'mine'],
      [7, 'assigned'],
      [8, 'recent'],
    ])
    expect(found[0]).toMatchObject({ host: 'gitlab', repo: 'team/api', author: 'luis', decision: 'waiting', projectId: 77 })
    expect(found[1]).toMatchObject({ isDraft: true, check: 'pending' })
    expect(found[2]).toMatchObject({ hasConflicts: true })
    expect(found[3]).toMatchObject({ state: 'merged' })
  })

  test('reads a pull request in full, failing checks first', () => {
    const answer = {
      body: `Fixes the timeouts.${String.fromCharCode(13)}\n`,
      additions: 57,
      deletions: 3,
      changedFiles: 2,
      baseRefName: 'develop',
      headRefName: 'fix/timeouts',
      latestReviews: [{ author: { login: 'ana' }, state: 'APPROVED' }, { author: { login: 'luis' }, state: 'COMMENTED' }],
      reviewRequests: [{ __typename: 'User', login: 'eva' }, { __typename: 'Team', name: 'Core' }],
      statusCheckRollup: [
        { __typename: 'CheckRun', name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS', detailsUrl: 'https://ci.example/1' },
        { __typename: 'CheckRun', name: 'lint', status: 'IN_PROGRESS', conclusion: '' },
        { __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: 'https://ci.example/2' },
        { __typename: 'StatusContext', context: 'deploy', state: 'SUCCESS', targetUrl: 'https://ci.example/3' },
      ],
    }
    expect(githubDetailOf(JSON.stringify(answer), 'k')).toEqual({
      key: 'k',
      body: 'Fixes the timeouts.',
      base: 'develop',
      head: 'fix/timeouts',
      additions: 57,
      deletions: 3,
      files: 2,
      checks: [
        { name: 'test', state: 'failing', url: 'https://ci.example/2' },
        { name: 'lint', state: 'pending', url: undefined },
        { name: 'build', state: 'passing', url: 'https://ci.example/1' },
        { name: 'deploy', state: 'passing', url: 'https://ci.example/3' },
      ],
      reviewers: [
        { who: 'ana', decision: 'approved' },
        { who: 'luis', decision: 'none' },
        { who: 'eva', decision: 'waiting' },
        { who: 'Core', decision: 'waiting' },
      ],
    })
  })

  test('reads a merge request in full', () => {
    const answer = {
      description: 'Adds the cache.',
      target_branch: 'main',
      source_branch: 'feat/cache',
      changes_count: '1000+',
      head_pipeline: { status: 'failed', web_url: 'https://gitlab.example/pipelines/9' },
      reviewers: [{ username: 'ana' }, { name: 'nobody' }],
    }
    expect(gitlabDetailOf(JSON.stringify(answer), 'k', 'Pipeline')).toEqual({
      key: 'k',
      body: 'Adds the cache.',
      base: 'main',
      head: 'feat/cache',
      files: 1000,
      checks: [{ name: 'Pipeline', state: 'failing', url: 'https://gitlab.example/pipelines/9' }],
      reviewers: [{ who: 'ana', decision: 'none' }],
    })
    expect(gitlabDetailOf(JSON.stringify({ changes_count: null }), 'k', 'Pipeline').checks).toEqual([])
  })

  test('names a request and the command that shows its changes', () => {
    expect(referenceOf({ host: 'github', number: 12 })).toBe('#12')
    expect(referenceOf({ host: 'gitlab', number: 12 })).toBe('!12')
    expect(diffCommandOf({ host: 'github', number: 12, repo: 'acme/app' })).toBe('gh pr diff 12 --repo acme/app')
    expect(diffCommandOf({ host: 'gitlab', number: 12, repo: 'team/api' })).toBe('glab mr diff 12 --repo team/api')
  })

  test('remembers the review requests already seen, newest first', () => {
    expect(seenAfter(['a', 'b'], ['c', 'a'])).toEqual(['c', 'a', 'b'])
    expect(seenAfter(Array.from({ length: 400 }, (_, at) => `k${at}`), ['new'])).toHaveLength(300)
  })

  test('says when in the reader language', () => {
    expect(relativeTimeOf('en', NOW - 2 * HOUR_MS, NOW)).toBe('2 hours ago')
    expect(relativeTimeOf('es', NOW - 26 * HOUR_MS, NOW)).toBe('ayer')
  })
})
