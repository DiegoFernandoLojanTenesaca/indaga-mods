import { describe, expect, mock, test } from 'claude-code/testing'
import type { Mounted } from 'claude-code/testing'

import { ICONS } from './icons'
import { THEMES } from './palette'

const PANE = {
  component: 'Pane',
  requestId: 'mail-pane',
  props: { title: 'Mail', isFocused: true, bodyColumns: 80, placement: 'dock' },
}
const NOW = Date.UTC(2026, 9, 21, 12)
const HOUR_MS = 3_600_000
const OPTIONS = { options: { domain: 'example.com' } }
const SEARCH = 'outlook_email_search'
const READ = 'read_resource'

type Mail = { id: string; name: string; subject: string; hoursAgo: number; isRead: boolean; hasAttachments?: boolean }

const ANA: Mail = { id: 'ana', name: 'Ana Ruiz', subject: 'Budget', hoursAgo: 1, isRead: false, hasAttachments: true }
const LUIS: Mail = { id: 'luis', name: 'Luis Mora', subject: 'Lunch', hoursAgo: 3, isRead: true }
const uriOf = (mail: Mail) => `mail:///messages/${mail.id}`
const rawOf = (mail: Mail) => ({
  uri: uriOf(mail),
  subject: mail.subject,
  sender: `${mail.id}@example.com`,
  senderName: mail.name,
  receivedDateTime: new Date(NOW - mail.hoursAgo * HOUR_MS).toISOString(),
  summary: 'preview',
  isRead: mail.isRead,
  hasAttachments: mail.hasAttachments === true,
  webLink: `https://outlook.example/${mail.id}`,
})
const FULL = {
  subject: 'Budget',
  body: { contentType: 'html', content: '<div>Here is the budget.</div><div id="divRplyFwdMsg"><b>From:</b> Luis</div><div>Older words</div>' },
  sender: { name: 'Ana Ruiz', address: 'ana@example.com' },
  toRecipients: [{ name: 'Luis Mora', address: 'luis@example.com' }],
  ccRecipients: [],
  receivedDateTime: new Date(NOW - HOUR_MS).toISOString(),
  attachments: [{ name: 'budget.xlsx', size: 12_288, isInline: false }],
  webLink: 'https://outlook.example/ana',
}

const pause = () => new Promise(done => (globalThis as any).setTimeout(done, 5))
const until = async (check: () => Promise<unknown>) => {
  for (let i = 0; i < 400 && !(await check()); i++) await pause()
}
const answer = (text: string) => ({ value: { content: [{ type: 'text', text }], isError: false } })

function engine(on: any, inbox: { mails: Mail[]; more?: Mail[]; fails?: boolean; fills?: boolean }) {
  const clock = mock.clock(on, { now: NOW })
  const calls: { tool: string; args: Record<string, unknown> }[] = []
  const toasts: string[] = []
  const fills: string[] = []
  const copies: string[] = []
  const opened: string[] = []
  const stored: Record<string, unknown> = {}
  on('session.start', (_$: any, e: any) => ({ sessionId: 's', cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: `mcp__mail-pane__${e.name}` } }))
  on('settings.read', () => ({ value: { language: 'English' } }))
  on('store.get', (_$: any, e: any) => ({ value: stored[e.key] }))
  on('store.set', (_$: any, e: any) => ((stored[e.key] = e.value), { value: undefined }))
  on('ui.open', (_$: any, e: any) => (opened.push(e.id), { value: { isPlaced: true } }))
  on('ui.toast', (_$: any, e: any) => (toasts.push(e.text), { value: undefined }))
  on('prompt.fill', (_$: any, e: any) => (fills.push(e.text), { isFilled: inbox.fills !== false }))
  on('ui.copy', (_$: any, e: any) => (copies.push(e.text), { value: { isCopied: true } }))
  on('mcp.call', (_$: any, e: any) => {
    calls.push({ tool: e.tool, args: e.args })
    if (inbox.fails) return { value: { content: [{ type: 'text', text: 'unavailable' }], isError: true } }
    if (e.tool === READ) return answer(JSON.stringify(FULL))
    const isMore = e.args.offset === 2
    const listed = isMore ? (inbox.more ?? []) : inbox.mails
    const paging = !isMore && inbox.more ? [{ moreResults: true, nextOffset: 2 }] : []
    return answer([...listed.map(rawOf), ...paging].map(one => JSON.stringify(one)).join(''))
  })
  return { clock, calls, toasts, fills, copies, opened, stored }
}

async function startPane($: any, surface: 'terminal' | 'desktop' = 'desktop') {
  await $.session.start({ surface, isInteractive: true, cwd: '/work' })
  return (await $.ui.mount({ plugin: 'mail-pane', surface, ...PANE })) as Mounted<'desktop'>
}

describe('mail-pane', () => {
  test('opens the pane at start, and again when Claude calls its tool', OPTIONS, async ($, on) => {
    const { opened } = engine(on, { mails: [] })
    await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' } as any)
    await until(async () => opened.length === 1)
    expect(await $.tool.call({ tool: 'mcp__mail-pane__open' } as any)).toMatchObject({ result: 'Mail pane opened.' })
    expect(opened).toEqual(['mail-pane', 'mail-pane'])
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`lists the newest mail of the domain, the unread marked, on ${surface}`, OPTIONS, async ($, on) => {
      const { calls } = engine(on, { mails: [LUIS, ANA] })
      const pane = await startPane($, surface)
      await until(() => pane.find({ key: `mail:${uriOf(ANA)}` }))
      expect(calls[0]).toEqual({ tool: SEARCH, args: { sender: 'example.com', order: 'newest', limit: 15, offset: 0 } })
      expect(await pane.find({ key: `mail:${uriOf(ANA)}`, text: /Ana Ruiz.*Budget.*1 hour ago · attachment/ })).toBeDefined()
      expect(await pane.find({ key: `mail:${uriOf(ANA)}`, text: new RegExp(ICONS.unread) })).toBeDefined()
      expect(await pane.find({ key: `mail:${uriOf(LUIS)}`, text: /Luis Mora.*Lunch.*3 hours ago/ })).toBeDefined()
      expect(await pane.find({ key: 'filter:unread', text: '1 unread' })).toBeDefined()
      expect(await pane.findAll({ type: 'Svg' })).toHaveLength(surface === 'desktop' ? 1 : 0)
      await pane.unmount()
    })
  }

  test('filters to the unread mail', OPTIONS, async ($, on) => {
    engine(on, { mails: [LUIS, ANA] })
    const pane = await startPane($)
    await until(() => pane.find({ key: `mail:${uriOf(LUIS)}` }))
    await pane.press({ key: 'filter:unread' })
    expect(await pane.find({ key: `mail:${uriOf(LUIS)}` })).toBeUndefined()
    expect(await pane.find({ key: `mail:${uriOf(ANA)}` })).toBeDefined()
  })

  test('searches the mail and clears the search', OPTIONS, async ($, on) => {
    const { calls } = engine(on, { mails: [ANA] })
    const pane = await startPane($)
    await until(() => pane.find({ key: 'search' }))
    await pane.input({ key: 'search', text: 'budget' })
    expect(calls.at(-1)).toEqual({ tool: SEARCH, args: { sender: 'example.com', query: 'budget', limit: 15, offset: 0 } })
    expect(await pane.find({ type: 'Text', text: 'Results for budget' })).toBeDefined()
    await pane.press({ key: 'clear' })
    expect(calls.at(-1)?.args).toMatchObject({ order: 'newest' })
    expect(await pane.find({ type: 'Text', text: 'Results for budget' })).toBeUndefined()
  })

  test('reads a mail, shows its thread, and goes back', OPTIONS, async ($, on) => {
    const { calls } = engine(on, { mails: [ANA] })
    const pane = await startPane($)
    await until(() => pane.find({ key: `mail:${uriOf(ANA)}` }))
    await pane.press({ key: `mail:${uriOf(ANA)}` })
    expect(calls.at(-1)).toEqual({ tool: READ, args: { uri: uriOf(ANA) } })
    expect(await pane.find({ type: 'Text', text: 'Budget' })).toMatchObject({ props: { bold: true } })
    expect(await pane.find({ type: 'Text', text: 'From Ana Ruiz <ana@example.com> · 1 hour ago' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'To Luis Mora <luis@example.com>' })).toBeDefined()
    expect(await pane.find({ key: 'body' })).toMatchObject({ props: { text: 'Here is the budget.' } })
    expect(await pane.find({ type: 'Text', text: 'budget.xlsx · 12 kB' })).toBeDefined()
    await pane.press({ key: 'thread' })
    expect(await pane.find({ key: 'body' })).toMatchObject({ props: { text: expect.stringContaining('Older words') } })
    await pane.press({ key: 'back' })
    expect(await pane.find({ key: `mail:${uriOf(ANA)}` })).toBeDefined()
  })

  test('passes a mail to the chat, or copies it where the prompt cannot be filled', OPTIONS, async ($, on) => {
    const inbox = { mails: [ANA], fills: true }
    const { fills, copies, toasts } = engine(on, inbox)
    const pane = await startPane($)
    await until(() => pane.find({ key: `mail:${uriOf(ANA)}` }))
    await pane.press({ key: `mail:${uriOf(ANA)}` })
    await pane.press({ key: 'toChat' })
    expect(fills[0]).toBe('Mail from Ana Ruiz <ana@example.com>, 1 hour ago\nSubject: Budget\n\nHere is the budget.')
    inbox.fills = false
    await pane.press({ key: 'toChat' })
    expect(copies).toEqual([fills[1]])
    expect(toasts).toEqual(['The mail was copied: paste it in the chat.'])
  })

  test('raises a toast for new mail from watched senders, after the first look', { options: { domain: 'example.com', watch: 'Ana Ruiz' } }, async ($, on) => {
    const inbox: { mails: Mail[] } = { mails: [ANA, LUIS] }
    const { clock, toasts, stored, calls } = engine(on, inbox)
    const pane = await startPane($)
    await until(() => pane.find({ key: `mail:${uriOf(ANA)}` }))
    expect(toasts).toEqual([])
    expect(stored.seenUntil).toBe(NOW - HOUR_MS)
    inbox.mails = [
      { id: 'ana2', name: 'Ana Ruiz', subject: 'Budget v2', hoursAgo: 0.1, isRead: false },
      { id: 'luis2', name: 'Luis Mora', subject: 'Dinner', hoursAgo: 0.2, isRead: false },
      ANA,
      LUIS,
    ]
    const before = calls.length
    await clock.advance(5 * 60_000)
    await until(async () => calls.length > before && toasts.length > 0)
    expect(toasts).toEqual(['New mail from Ana Ruiz: Budget v2'])
    await pane.unmount()
  })

  test('shows the next page', OPTIONS, async ($, on) => {
    const { calls } = engine(on, { mails: [ANA], more: [LUIS] })
    const pane = await startPane($)
    await until(() => pane.find({ key: 'more' }))
    await pane.press({ key: 'more' })
    expect(calls.at(-1)?.args).toMatchObject({ offset: 2 })
    expect(await pane.find({ key: `mail:${uriOf(LUIS)}` })).toBeDefined()
    expect(await pane.find({ key: 'more' })).toBeUndefined()
  })

  test('says so when the connector fails', OPTIONS, async ($, on) => {
    engine(on, { mails: [], fails: true })
    const pane = await startPane($)
    await until(() => pane.find({ type: 'Text', text: /connector did not answer/ }))
    expect(await pane.find({ type: 'Text', text: /connector did not answer/ })).toBeDefined()
  })

  test('shows the whole inbox when no domain is set', async ($, on) => {
    const { calls } = engine(on, { mails: [ANA] })
    const pane = await startPane($)
    await until(() => pane.find({ key: `mail:${uriOf(ANA)}` }))
    expect(calls[0]?.args).toEqual({ order: 'newest', limit: 15, offset: 0 })
    expect(await pane.findAll({ type: 'Svg' })).toHaveLength(1)
  })

  test('picks a theme from its dots and keeps it', OPTIONS, async ($, on) => {
    const { stored } = engine(on, { mails: [ANA] })
    const pane = await startPane($)
    await until(() => pane.find({ key: 'theme:blue', text: ICONS.themeChosen }))
    await pane.press({ key: 'theme:green' })
    expect(stored.theme).toBe('green')
    expect(await pane.find({ key: `mail:${uriOf(ANA)}`, text: new RegExp(ICONS.unread) })).toBeDefined()
    expect(await pane.find({ key: 'theme:green', text: ICONS.themeChosen })).toMatchObject({})
    expect(await pane.find({ type: 'Text', text: ICONS.themeChosen })).toMatchObject({ props: { color: THEMES.green } })
  })
})
