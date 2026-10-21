export type MailSummary = {
  uri: string
  subject: string
  from: string
  fromName: string
  receivedMs: number
  preview: string
  isRead: boolean
  hasAttachments: boolean
  webLink?: string
}

export type MailAttachment = {
  uri: string
  name: string
  size: number
  contentType: string
}

export type MailMessage = {
  uri: string
  subject: string
  from: string
  fromName: string
  to: string[]
  cc: string[]
  receivedMs: number
  body: string
  thread: string
  attachments: MailAttachment[]
  webLink?: string
}

export type MailPreview = {
  name: string
  text?: string
  image?: { data: string; mimeType: string }
}

export type MailSaved = {
  uri: string
  folder: string
  files: string[]
}

export type MailFilter = 'all' | 'unread'

export type MailBusy = 'list' | 'more' | 'mail' | 'attachment' | 'save'

export type MailProblem = {
  key: 'connectorFailed' | 'mailFailed' | 'chatFailed' | 'attachmentFailed' | 'saveFailed'
  values?: Record<string, string>
}

declare module 'claude-code' {
  interface McpToolInputs {
    'mcp__mail-pane__open': Record<string, never>
  }

  interface PluginState {
    'mail-pane': {
      mails: MailSummary[]
      nextOffset: number | null
      query: string
      filter: MailFilter
      message: MailMessage | null
      isThreadShown: boolean
      preview: MailPreview | null
      saved: MailSaved | null
      busy: MailBusy | null
      problem: MailProblem | null
      theme: string
      now: number
    }
  }
}
