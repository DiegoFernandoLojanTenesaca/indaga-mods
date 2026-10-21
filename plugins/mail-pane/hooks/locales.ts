const en = {
  title: 'Mail',
  commandDescription: 'Open the mail pane beside the chat',
  commandOpened: 'Mail pane opened.',
  inbox: 'Inbox',
  unreadCount: '{count} unread',
  bannerLine: '{source} · {unread}',
  searchLabel: 'Search',
  searchPlaceholder: 'Words in the subject, the body or an attachment',
  searchSubmit: 'Search',
  all: 'All',
  refresh: 'Refresh',
  more: 'Show more',
  loading: 'Loading…',
  empty: 'No mail here.',
  resultsFor: 'Results for {query}',
  clear: 'Clear',
  back: 'Back',
  toChat: 'Pass to the chat',
  outlook: 'Open in Outlook',
  fromLine: 'From {who} · {when}',
  toLine: 'To {who}',
  ccLine: 'Cc {who}',
  attachment: 'attachment',
  attachmentsHeading: 'Attachments',
  showThread: 'Show the whole thread',
  hideThread: 'Hide the thread',
  noBody: 'This mail has no text.',
  newMail: 'New mail from {who}: {subject}',
  chatText: 'Mail from {who}, {when}\nSubject: {subject}\n\n{body}',
  copied: 'The mail was copied: paste it in the chat.',
  connectorFailed: 'The Microsoft 365 connector did not answer. Check that it is connected in this session.',
  mailFailed: 'That mail could not be read.',
  chatFailed: 'The mail could not be passed to the chat.',
  theme: 'Theme',
}

export type MessageKey = keyof typeof en

const es: Record<MessageKey, string> = {
  title: 'Correo',
  commandDescription: 'Abre el panel de correo junto al chat',
  commandOpened: 'Panel de correo abierto.',
  inbox: 'Bandeja de entrada',
  unreadCount: '{count} sin leer',
  bannerLine: '{source} · {unread}',
  searchLabel: 'Buscar',
  searchPlaceholder: 'Palabras del asunto, del texto o de un adjunto',
  searchSubmit: 'Buscar',
  all: 'Todos',
  refresh: 'Actualizar',
  more: 'Ver más',
  loading: 'Cargando…',
  empty: 'No hay correos aquí.',
  resultsFor: 'Resultados de {query}',
  clear: 'Quitar',
  back: 'Volver',
  toChat: 'Pasar al chat',
  outlook: 'Abrir en Outlook',
  fromLine: 'De {who} · {when}',
  toLine: 'Para {who}',
  ccLine: 'CC {who}',
  attachment: 'adjunto',
  attachmentsHeading: 'Adjuntos',
  showThread: 'Ver el hilo completo',
  hideThread: 'Ocultar el hilo',
  noBody: 'Este correo no tiene texto.',
  newMail: 'Correo nuevo de {who}: {subject}',
  chatText: 'Correo de {who}, {when}\nAsunto: {subject}\n\n{body}',
  copied: 'Se copió el correo: pégalo en el chat.',
  connectorFailed: 'El conector de Microsoft 365 no respondió. Revisa que esté conectado en esta sesión.',
  mailFailed: 'No se pudo leer ese correo.',
  chatFailed: 'No se pudo pasar el correo al chat.',
  theme: 'Tema',
}

const LOCALES = {
  en: { names: ['en', 'english', 'inglés'], messages: en },
  es: { names: ['es', 'español', 'espanol', 'spanish', 'castellano'], messages: es },
}

export type Locale = keyof typeof LOCALES

const BASE_LOCALE: Locale = 'en'

export function localeOf(language: string | undefined): Locale {
  const name = (language ?? '').trim().toLowerCase().split(/[-_\s]/)[0] ?? ''
  const found = (Object.keys(LOCALES) as Locale[]).find(locale => LOCALES[locale].names.includes(name))
  return found ?? BASE_LOCALE
}

export const translate = (locale: Locale, key: MessageKey, values: Record<string, string> = {}) =>
  LOCALES[locale].messages[key].replace(/\{(\w+)\}/g, (whole, name: string) => values[name] ?? whole)
