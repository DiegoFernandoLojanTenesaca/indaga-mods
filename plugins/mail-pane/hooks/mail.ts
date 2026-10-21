import type { MailAttachment, MailMessage, MailSummary } from '../types'

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const QUOTE_MARKERS = [
  /<div[^>]*id="divRplyFwdMsg"/i,
  /<div[^>]*id="appendonsend"/i,
  /<div[^>]*class="[^"]*gmail_quote/i,
  /<blockquote/i,
]
const DROPPED = /<(style|script|head|title)[^>]*>[\s\S]*?<\/\1>/gi
const LINK = /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
const BOLD = /<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi
const ITEM = /<li\b[^>]*>/gi
const BREAK = /<br\s*\/?>/gi
const BLOCK_END = /<\/(p|div|tr|h[1-6]|li|ul|ol|table)>/gi
const RULE = /<hr\b[^>]*>/gi
const TAG = /<[^>]+>/g
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi
const LIST_SPLIT = /[,;\n]+/
const SAFE_LINK = /^(https?:|mailto:)/i
const MAILTO = /^mailto:/i
const LOOSE_ITEM = /^(- .*)\n\n(?=- )/gm
const SOFT_BREAK = /([^\n])\n(?!\n|- )/g
const HARD_BREAK = '  \n'
const UNSAFE_NAME = /[<>:"/\\|?*\u0000-\u001f]/g
const NAME_LENGTH = 80
const DAY_LENGTH = 10
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['week', 604_800_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]
const CARRIAGE_RETURN = String.fromCharCode(13)

type Raw = Record<string, unknown>

const textOf = (value: unknown) => (typeof value === 'string' ? value : '')

export function jsonObjectsOf(text: string): Raw[] {
  const found: Raw[] = []
  let depth = 0
  let start = -1
  let isInString = false
  let isEscaped = false
  for (let at = 0; at < text.length; at++) {
    const char = text[at]
    if (isInString) {
      if (isEscaped) isEscaped = false
      else if (char === '\\') isEscaped = true
      else if (char === '"') isInString = false
      continue
    }
    if (char === '"') isInString = true
    else if (char === '{') {
      if (depth === 0) start = at
      depth++
    } else if (char === '}' && depth > 0) {
      depth--
      if (depth === 0) {
        const parsed = parsedOf(text.slice(start, at + 1))
        if (parsed) found.push(parsed)
      }
    }
  }
  return found
}

function parsedOf(json: string): Raw | undefined {
  try {
    const value: unknown = JSON.parse(json)
    return value && typeof value === 'object' ? (value as Raw) : undefined
  } catch {
    return undefined
  }
}

export function summaryOf(raw: Raw): MailSummary | undefined {
  const uri = textOf(raw.uri)
  if (!uri) return undefined
  return {
    uri,
    subject: textOf(raw.subject),
    from: textOf(raw.sender),
    fromName: textOf(raw.senderName) || textOf(raw.sender),
    receivedMs: Date.parse(textOf(raw.receivedDateTime)) || 0,
    preview: textOf(raw.summary).replaceAll(CARRIAGE_RETURN, '').trim(),
    isRead: raw.isRead !== false,
    hasAttachments: raw.hasAttachments === true,
    webLink: textOf(raw.webLink) || undefined,
  }
}

export function pageOf(text: string) {
  const objects = jsonObjectsOf(text)
  const mails = objects.flatMap(raw => summaryOf(raw) ?? []).sort((a, b) => b.receivedMs - a.receivedMs)
  const paging = objects.find(raw => typeof raw.nextOffset === 'number')
  return { mails, nextOffset: paging ? (paging.nextOffset as number) : null }
}

const decoded = (text: string) =>
  text.replace(ENTITY, (whole, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) return String.fromCodePoint(parseInt(name.slice(2), 16))
    if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)))
    return ENTITIES[name.toLowerCase()] ?? whole
  })

export function markdownOf(html: string) {
  const text = html
    .replace(DROPPED, '')
    .replace(LINK, (_whole, href: string, label: string) => {
      const words = label.replace(TAG, '').trim()
      const target = decoded(href)
      const address = target.replace(MAILTO, '')
      return SAFE_LINK.test(target) && words && words !== target && words !== address ? `[${words}](${target})` : words || address
    })
    .replace(BOLD, (_whole, _tag: string, inner: string) => {
      const words = inner.replace(TAG, '').trim()
      return words ? `**${words}**` : ''
    })
    .replace(ITEM, '\n- ')
    .replace(BREAK, '\n')
    .replace(RULE, '\n---\n')
    .replace(BLOCK_END, '\n')
    .replace(TAG, '')
  return decoded(text)
    .split('\n')
    .map(line => line.replaceAll(CARRIAGE_RETURN, '').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(LOOSE_ITEM, '$1\n')
    .replace(SOFT_BREAK, `$1${HARD_BREAK}`)
    .trim()
}

export function newestPartOf(html: string) {
  const cuts = QUOTE_MARKERS.map(marker => html.search(marker)).filter(at => at > 0)
  return cuts.length > 0 ? html.slice(0, Math.min(...cuts)) : html
}

const peopleOf = (value: unknown) =>
  Array.isArray(value)
    ? value.flatMap(person => {
        const one = person as Raw
        const name = textOf(one.name)
        const address = textOf(one.address)
        return name || address ? [name && address && name !== address ? `${name} <${address}>` : name || address] : []
      })
    : []

export function messageOf(raw: Raw, uri: string): MailMessage {
  const body = (raw.body ?? {}) as Raw
  const content = textOf(body.content)
  const isHtml = textOf(body.contentType).toLowerCase() === 'html'
  const sender = (raw.sender ?? {}) as Raw
  const thread = isHtml ? markdownOf(content) : content.replaceAll(CARRIAGE_RETURN, '').trim()
  const newest = isHtml ? markdownOf(newestPartOf(content)) : thread
  const attachments: MailAttachment[] = Array.isArray(raw.attachments)
    ? raw.attachments.flatMap(item => {
        const one = item as Raw
        return one.isInline === true || !textOf(one.name) || !textOf(one.uri)
          ? []
          : [{ uri: textOf(one.uri), name: textOf(one.name), size: Number(one.size) || 0, contentType: textOf(one.contentType) }]
      })
    : []
  return {
    uri,
    subject: textOf(raw.subject),
    from: textOf(sender.address),
    fromName: textOf(sender.name) || textOf(sender.address),
    to: peopleOf(raw.toRecipients),
    cc: peopleOf(raw.ccRecipients),
    receivedMs: Date.parse(textOf(raw.receivedDateTime)) || 0,
    body: newest,
    thread,
    attachments,
    webLink: textOf(raw.webLink) || undefined,
  }
}

export type AttachmentContent = { data: string; mimeType: string } | { text: string }

export function contentOf(blocks: readonly Record<string, unknown>[]): AttachmentContent | undefined {
  for (const block of blocks) {
    const resource = (block.resource ?? {}) as Raw
    const data = textOf(block.data) || textOf(resource.blob)
    const mimeType = textOf(block.mimeType) || textOf(resource.mimeType)
    if (data) return { data, mimeType }
  }
  const text = blocks.map(block => textOf(block.text) || textOf(((block.resource ?? {}) as Raw).text)).join('')
  return text ? { text } : undefined
}

export const isImage = (mimeType: string) => mimeType.toLowerCase().startsWith('image/')

export const safeNameOf = (text: string) =>
  text
    .replace(UNSAFE_NAME, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_LENGTH)
    .replace(/[. ]+$/, '')

export const dayOf = (receivedMs: number) => new Date(receivedMs).toISOString().slice(0, DAY_LENGTH)

export const joinPath = (dir: string, name: string) =>
  `${dir.replace(/[\\/]+$/, '')}${dir.includes('\\') ? '\\' : '/'}${name}`

export const watchListOf = (text: string) =>
  text
    .split(LIST_SPLIT)
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean)

export function isWatched(mail: MailSummary, watch: readonly string[]) {
  if (watch.length === 0) return true
  const address = mail.from.toLowerCase()
  const name = mail.fromName.toLowerCase()
  return watch.some(entry => address === entry || address.endsWith(`@${entry}`) || name.includes(entry))
}

export function relativeTimeOf(locale: string, thenMs: number, nowMs: number) {
  const gap = thenMs - nowMs
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const unit = UNITS.find(([, size]) => Math.abs(gap) >= size)
  return unit ? format.format(Math.round(gap / unit[1]), unit[0]) : format.format(0, 'minute')
}

export const sizeOf = (locale: string, bytes: number) =>
  new Intl.NumberFormat(locale, { style: 'unit', unit: 'kilobyte', maximumFractionDigits: 0 }).format(Math.max(1, bytes / 1024))
