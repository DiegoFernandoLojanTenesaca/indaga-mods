import { describe, expect, test } from 'claude-code/testing'

import {
  contentOf,
  dayOf,
  isImage,
  isWatched,
  joinPath,
  jsonObjectsOf,
  markdownOf,
  messageOf,
  newestPartOf,
  pageOf,
  relativeTimeOf,
  safeNameOf,
  savedPathOf,
  sizeOf,
  summaryOf,
  textFileNameOf,
  watchListOf,
} from './mail'

const HOUR_MS = 3_600_000
const RETURN = String.fromCharCode(13)

const raw = (id: string, hoursAgo: number, isRead: boolean) => ({
  uri: `mail:///messages/${id}`,
  subject: `Subject ${id}`,
  sender: `${id}@example.com`,
  senderName: `Person ${id}`,
  receivedDateTime: new Date(Date.UTC(2026, 9, 21, 12) - hoursAgo * HOUR_MS).toISOString(),
  summary: `Hello${RETURN}\nthere`,
  isRead,
  hasAttachments: id === 'b',
  webLink: `https://outlook.example/${id}`,
})

describe('mail', () => {
  test('reads JSON objects written one after another, braces in strings included', () => {
    const text = `{"a":"{not a brace}","b":"say \\"hi\\""}garbage{"c":{"d":1}}{"broken":`
    expect(jsonObjectsOf(text)).toEqual([{ a: '{not a brace}', b: 'say "hi"' }, { c: { d: 1 } }])
  })

  test('turns a search answer into a page of mail, newest first', () => {
    const text = [raw('a', 5, true), raw('b', 1, false), { moreResults: true, nextOffset: 2, totalResultCount: 9 }].map(one => JSON.stringify(one)).join('')
    const page = pageOf(text)
    expect(page.nextOffset).toBe(2)
    expect(page.mails.map(mail => mail.uri)).toEqual(['mail:///messages/b', 'mail:///messages/a'])
    expect(page.mails[0]).toMatchObject({ fromName: 'Person b', from: 'b@example.com', isRead: false, hasAttachments: true, preview: 'Hello\nthere' })
    expect(pageOf(JSON.stringify(raw('a', 1, true))).nextOffset).toBeNull()
    expect(summaryOf({ subject: 'no uri' })).toBeUndefined()
  })

  test('turns mail HTML into markdown text', () => {
    const html = [
      '<style>.x{color:red}</style>',
      '<div>Hello <b>team</b>,</div>',
      '<div><br /></div>',
      '<ul><li><div>first &amp; done</div></li><li>second &lt;ok&gt;</li></ul>',
      '<p>See <a href="https://example.com/doc">the doc</a> or <a href="mailto:a@example.com">a@example.com</a>.</p>',
      '<div>Caf&eacute;&nbsp;&#10003;&#x41;</div>',
    ].join('')
    expect(markdownOf(html)).toBe('Hello **team**,\n\n- first & done\n- second <ok>\n\nSee [the doc](https://example.com/doc) or a@example.com.  \nCaf&eacute; ✓A')
  })

  test('keeps the newest part of a reply apart from the quoted thread', () => {
    const outlook = '<div>New words</div><hr /><div id="divRplyFwdMsg"><b>From:</b> Someone</div><div>Old words</div>'
    expect(markdownOf(newestPartOf(outlook))).toBe('New words\n\n---')
    expect(newestPartOf('<div>Reply</div><div class="x_gmail_quote">quoted</div>')).toBe('<div>Reply</div>')
    expect(newestPartOf('<p>No quote</p>')).toBe('<p>No quote</p>')
  })

  test('reads a whole mail', () => {
    const mail = messageOf(
      {
        subject: 'Plan',
        body: { contentType: 'html', content: '<div>Short answer</div><blockquote>Long thread</blockquote>' },
        sender: { name: 'Ana Ruiz', address: 'ana@example.com' },
        toRecipients: [{ name: 'Luis Mora', address: 'luis@example.com' }],
        ccRecipients: [{ name: '', address: 'team@example.com' }],
        receivedDateTime: '2026-10-21T10:00:00.000Z',
        attachments: [
          { uri: 'mail:///a/1', name: 'image.png', size: 900, contentType: 'image/png', isInline: true },
          { uri: 'mail:///a/2', name: 'plan.md', size: 12_288, contentType: 'text/markdown', isInline: false },
          { name: 'no-uri.txt', size: 10, isInline: false },
        ],
        webLink: 'https://outlook.example/plan',
      },
      'mail:///messages/plan',
    )
    expect(mail).toMatchObject({
      uri: 'mail:///messages/plan',
      subject: 'Plan',
      fromName: 'Ana Ruiz',
      from: 'ana@example.com',
      to: ['Luis Mora <luis@example.com>'],
      cc: ['team@example.com'],
      body: 'Short answer',
      thread: 'Short answer  \nLong thread',
      attachments: [{ uri: 'mail:///a/2', name: 'plan.md', size: 12_288, contentType: 'text/markdown' }],
    })
    expect(messageOf({ body: { contentType: 'text', content: `plain${RETURN}\ntext` } }, 'x').body).toBe('plain\ntext')
  })

  test('reads an attachment as text or as bytes', () => {
    expect(contentOf([{ type: 'text', text: '# Notes' }])).toEqual({ text: '# Notes' })
    expect(contentOf([{ type: 'image', data: 'UE5H', mimeType: 'image/png' }])).toEqual({ data: 'UE5H', mimeType: 'image/png' })
    expect(contentOf([{ type: 'resource', resource: { uri: 'x', mimeType: 'application/pdf', blob: 'JVBE' } }])).toEqual({ data: 'JVBE', mimeType: 'application/pdf' })
    expect(contentOf([{ type: 'resource', resource: { uri: 'x', text: 'plain' } }])).toEqual({ text: 'plain' })
    expect(
      contentOf([
        { type: 'text', text: '[Resource from Mail at mail:///a/1] ' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'UE5H' } },
        { type: 'text', text: '[Image: source: C:\\results\\blob.png]' },
      ]),
    ).toEqual({ data: 'UE5H', mimeType: 'image/png' })
    const notice = { note: 'PDF text extraction failed.', attachment: { name: 'scan.pdf' }, messageUri: 'mail:///m' }
    expect(contentOf([{ type: 'text', text: JSON.stringify(notice) }])).toBeUndefined()
    expect(contentOf([])).toBeUndefined()
    expect(textFileNameOf('report.pdf', 'application/pdf')).toBe('report.pdf.txt')
    expect(textFileNameOf('notes.md', 'text/markdown')).toBe('notes.md')
    expect(textFileNameOf('cases.json', 'application/json')).toBe('cases.json')
    expect(isImage('image/jpeg')).toBe(true)
    expect(isImage('application/pdf')).toBe(false)
  })

  test('finds where a result too long for the session was saved', () => {
    const text = [
      'Error: result (50,710 characters across 1 line) exceeds maximum allowed tokens. Output has been saved to C:\\Users\\me\\.claude\\tool-results\\read.txt.',
      'Format: Plain text',
    ].join('\n')
    expect(savedPathOf(text)).toBe('C:\\Users\\me\\.claude\\tool-results\\read.txt')
    expect(savedPathOf('{"subject":"Plan"}')).toBeUndefined()
  })

  test('names folders and files safely', () => {
    expect(safeNameOf('RE: Plan / Q4 <final>?')).toBe('RE Plan Q4 final')
    expect(safeNameOf('notes.')).toBe('notes')
    expect(safeNameOf('a'.repeat(200))).toHaveLength(80)
    expect(dayOf(Date.UTC(2026, 9, 21, 12))).toBe('2026-10-21')
    expect(joinPath('C:\\Users\\me\\', 'Mail')).toBe('C:\\Users\\me\\Mail')
    expect(joinPath('/home/me', 'Mail')).toBe('/home/me/Mail')
  })

  test('watches senders by address, domain or name', () => {
    const mail = summaryOf(raw('ana', 1, false))!
    expect(watchListOf(' Ana@Example.com; luis ,\n')).toEqual(['ana@example.com', 'luis'])
    expect(isWatched(mail, [])).toBe(true)
    expect(isWatched(mail, ['ana@example.com'])).toBe(true)
    expect(isWatched(mail, ['example.com'])).toBe(true)
    expect(isWatched(mail, ['person ana'])).toBe(true)
    expect(isWatched(mail, ['luis'])).toBe(false)
  })

  test('says when and how big in the reader language', () => {
    const nowMs = Date.UTC(2026, 9, 21, 12)
    expect(relativeTimeOf('en', nowMs - 2 * HOUR_MS, nowMs)).toBe('2 hours ago')
    expect(relativeTimeOf('es', nowMs - 2 * HOUR_MS, nowMs)).toBe('hace 2 horas')
    expect(relativeTimeOf('es', nowMs - 26 * HOUR_MS, nowMs)).toBe('ayer')
    expect(sizeOf('en', 12_288)).toBe('12 kB')
  })
})
