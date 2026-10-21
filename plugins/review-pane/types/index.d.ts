export type ReviewHost = 'github' | 'gitlab'

export type ReviewRole = 'review' | 'mine' | 'assigned' | 'involved' | 'recent'

export type ReviewState = 'open' | 'merged' | 'closed'

export type ReviewCheck = 'passing' | 'failing' | 'pending' | 'none'

export type ReviewDecision = 'approved' | 'changes' | 'waiting' | 'none'

export type ReviewItem = {
  key: string
  host: ReviewHost
  role: ReviewRole
  repo: string
  number: number
  title: string
  author: string
  url: string
  updatedMs: number
  state: ReviewState
  isDraft: boolean
  hasConflicts: boolean
  check: ReviewCheck
  decision: ReviewDecision
  projectId?: number
}

export type ReviewCheckRun = {
  name: string
  state: ReviewCheck
  url?: string
}

export type ReviewReviewer = {
  who: string
  decision: ReviewDecision
}

export type ReviewDetail = {
  key: string
  body: string
  base: string
  head: string
  additions?: number
  deletions?: number
  files: number
  checks: ReviewCheckRun[]
  reviewers: ReviewReviewer[]
}

export type ReviewBusy = 'list' | 'detail'

export type ReviewProblem = {
  key: 'detailFailed' | 'chatFailed'
}

declare module 'claude-code' {
  interface McpToolInputs {
    'mcp__review-pane__open': Record<string, never>
  }

  interface PluginState {
    'review-pane': {
      items: ReviewItem[]
      failed: ReviewHost[]
      opened: ReviewItem | null
      detail: ReviewDetail | null
      busy: ReviewBusy | null
      problem: ReviewProblem | null
      theme: string
      now: number
    }
  }
}
