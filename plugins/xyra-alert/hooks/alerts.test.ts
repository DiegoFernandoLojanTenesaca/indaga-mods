import { describe, expect, test } from 'claude-code/testing'

import { alertsOf } from './alerts'
import type { XyraState } from './alerts'

const IDLE: XyraState = { phase: 'client', ready_check: false, champ_select: null, game: null, lobby: { searching: true } }
const FOUND: XyraState = { ...IDLE, ready_check: true }
const PICKING: XyraState = { ...IDLE, phase: 'champSelect', lobby: null, champ_select: { champion: { name: 'Jinx' } } }
const PLAYING: XyraState = { ...IDLE, phase: 'inGame', lobby: null, game: { champion: { name: 'Jinx' } } }
const PAUSED: XyraState = { ...PLAYING, phase: 'paused' }

describe('alerts', () => {
  test('announces a found match, its acceptance and the start of the game', () => {
    expect(alertsOf(IDLE, FOUND)).toEqual([{ key: 'found' }])
    expect(alertsOf(FOUND, PICKING)).toEqual([{ key: 'accepted' }])
    expect(alertsOf(PICKING, PLAYING)).toEqual([{ key: 'started', values: { champion: 'Jinx' } }])
  })

  test('tells a match that sends you back to the queue from one that did not start', () => {
    expect(alertsOf(FOUND, IDLE)).toEqual([{ key: 'requeued' }])
    expect(alertsOf(FOUND, { ...IDLE, lobby: { searching: false } })).toEqual([{ key: 'notFormed' }])
  })

  test('says champion select alone when no match was found first, and nothing while nothing changes', () => {
    expect(alertsOf(IDLE, PICKING)).toEqual([{ key: 'champSelect' }])
    expect(alertsOf(IDLE, IDLE)).toEqual([])
    expect(alertsOf(PLAYING, PAUSED)).toEqual([])
    expect(alertsOf(PAUSED, PLAYING)).toEqual([])
  })

  test('names the champion from champion select when the game has none yet', () => {
    expect(alertsOf(PICKING, { ...PLAYING, game: { champion: null } })).toEqual([{ key: 'started', values: { champion: 'Jinx' } }])
    expect(alertsOf({ ...PICKING, champ_select: null }, { ...PLAYING, game: null })).toEqual([{ key: 'startedPlain' }])
  })
})
