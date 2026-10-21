import { describe, expect, test } from 'claude-code/testing'

import { closeness, normalized, searchLocal, similarity, songKeyOf } from './search'

const track = (title: string) => ({ id: `/m/${title}.mp3`, album: '/m', title, audio: `/m/${title}.mp3` })
const ITEMS = [
  { track: track('01 - Canción'), album: 'First Album', artist: 'Band', lines: ['Waiting alone on the corner,', 'the rain keeps falling on me'] },
  { track: track('02 - Hallway'), album: 'First Album', artist: 'Band', lines: ['Not with me this time'] },
  { track: track('03 - Neon'), album: 'Second Album', artist: 'Band', lines: [] },
]

describe('search', () => {
  test('compares text without accents, case or punctuation', () => {
    expect(normalized('  ¡Árbol, ÚLTIMA canción!  ')).toBe('arbol ultima cancion')
    expect(similarity('cancion', 'cancion')).toBe(1)
    expect(similarity('', 'x')).toBe(0)
    expect(similarity('cansion', 'cancion')).toBeGreaterThan(0.6)
    expect(closeness('rain falling', 'the rain keeps falling on me')).toBeLessThan(1)
    expect(closeness('rain keeps falling', 'the rain keeps falling on me')).toBe(1)
  })

  test('finds songs by title, album, artist or a line of the lyrics', () => {
    expect(searchLocal('canción', ITEMS).hits.map(hit => hit.title)).toEqual(['01 - Canción'])
    expect(searchLocal('THE RAIN', ITEMS).hits.map(hit => hit.title)).toEqual(['01 - Canción'])
    expect(searchLocal('second album', ITEMS).hits.map(hit => hit.title)).toEqual(['03 - Neon'])
    expect(searchLocal('band', ITEMS).hits).toHaveLength(3)
    expect(searchLocal('   ', ITEMS)).toEqual({ hits: [] })
  })

  test('names the song alike across its uploads', () => {
    expect(songKeyOf('Fireflies')).toBe('fireflies')
    expect(songKeyOf('Some Singer - FIREFLIES (Live)')).toBe('fireflies')
    expect(songKeyOf('Fireflies ft. Another Singer [Lyric Video]')).toBe('fireflies')
    expect(songKeyOf('07 - Neon')).toBe('neon')
    expect(songKeyOf('Neon')).not.toBe(songKeyOf('Neon Blue'))
  })

  test('offers the closest title or line when nothing matches', () => {
    expect(searchLocal('cansion', ITEMS)).toEqual({ hits: [], suggestion: { track: ITEMS[0]!.track } })
    expect(searchLocal('waiting alone on the cornr', ITEMS)).toEqual({
      hits: [],
      suggestion: { track: ITEMS[0]!.track, line: 'Waiting alone on the corner,' },
    })
    expect(searchLocal('romantic salsa', ITEMS)).toEqual({ hits: [] })
  })
})
