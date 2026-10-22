const en = {
  found: 'Match found!',
  accepted: 'Match accepted. Champion select.',
  acceptedByXyra: 'Xyra accepted it. Champion select.',
  champSelect: 'Champion select.',
  requeued: 'Someone did not accept. You are still in the queue.',
  notFormed: 'The match did not start.',
  started: 'The game started: {champion}.',
  startedPlain: 'The game started.',
}

export type MessageKey = keyof typeof en

const es: Record<MessageKey, string> = {
  found: '¡Partida encontrada!',
  accepted: 'Partida aceptada. Selección de campeón.',
  acceptedByXyra: 'Xyra la aceptó. Selección de campeón.',
  champSelect: 'Selección de campeón.',
  requeued: 'Alguien no aceptó. Sigues en cola.',
  notFormed: 'La partida no se armó.',
  started: 'La partida empezó: {champion}.',
  startedPlain: 'La partida empezó.',
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
