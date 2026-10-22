import type { MessageKey } from './locales'

export type XyraPhase = 'noClient' | 'client' | 'champSelect' | 'inGame' | 'paused'

type Champion = { name: string } | null

export type XyraState = {
  phase: XyraPhase
  ready_check: boolean
  champ_select: { champion: Champion } | null
  game: { champion: Champion } | null
  lobby: { searching: boolean } | null
}

export type XyraAlert = { key: MessageKey; values?: Record<string, string> }

const PLAYING = new Set<XyraPhase>(['inGame', 'paused'])

export function alertsOf(before: XyraState, after: XyraState): XyraAlert[] {
  const alerts: XyraAlert[] = []
  if (!before.ready_check && after.ready_check) alerts.push({ key: 'found' })
  if (before.phase !== 'champSelect' && after.phase === 'champSelect') alerts.push({ key: before.ready_check ? 'accepted' : 'champSelect' })
  if (before.ready_check && !after.ready_check && after.phase !== 'champSelect') alerts.push({ key: after.lobby?.searching ? 'requeued' : 'notFormed' })
  if (!PLAYING.has(before.phase) && after.phase === 'inGame') {
    const champion = after.game?.champion?.name ?? before.champ_select?.champion?.name
    alerts.push(champion ? { key: 'started', values: { champion } } : { key: 'startedPlain' })
  }
  return alerts
}
