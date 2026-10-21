import { describe, expect, test } from 'claude-code/testing'

import {
  clockOf,
  coverOf,
  cueIndexAt,
  hashOf,
  joinPath,
  parseSrt,
  reportOf,
  splitTitle,
  stanzasOf,
  tracksOf,
  youtubeUrlOf,
} from './library'
import { localeOf, translate } from './locales'

const BOM = String.fromCharCode(0xfeff)
const CRLF = String.fromCharCode(13, 10)
const LINE = String.fromCharCode(10)

describe('library', () => {
  test('pairs each song with its lyrics by name, one level below the album', () => {
    const tracks = tracksOf('Album', [
      'D:\\Music\\Album\\Songs\\10 - Last.mp3',
      'D:\\Music\\Album\\Songs\\02 - Second.mp3',
      'D:\\Music\\Album\\Songs\\02 - Second.txt',
      'D:\\Music\\Album\\Videos\\02 - Second.srt',
      'D:\\Music\\Album\\Videos\\02 - Second.mp4',
      'D:\\Music\\Album\\Notes\\Lonely.srt',
    ])
    expect(tracks.map(track => track.title)).toEqual(['02 - Second', '10 - Last'])
    expect(tracks[0]).toEqual({
      id: 'D:\\Music\\Album\\Songs\\02 - Second.mp3',
      album: 'Album',
      title: '02 - Second',
      audio: 'D:\\Music\\Album\\Songs\\02 - Second.mp3',
      synced: 'D:\\Music\\Album\\Videos\\02 - Second.srt',
      plain: 'D:\\Music\\Album\\Songs\\02 - Second.txt',
    })
    expect(tracks[1]?.synced).toBeUndefined()
    expect(joinPath('D:\\Music\\', 'Album')).toBe('D:\\Music\\Album')
    expect(joinPath('/music', 'Album')).toBe('/music/Album')
  })

  test('reads an srt with a BOM, CRLF, markup and two-line cues', () => {
    const srt = `${BOM}1\r\n00:00:01,500 --> 00:00:03,000\r\n<i>First</i> line\r\n\r\n2\r\n00:01:02,250 --> 00:01:04,000\r\nSecond\r\nline\r\n\r\n3\r\n00:01:05,000 --> 00:01:06,000\r\n{\\fad(1,1)}\r\n`
    expect(parseSrt(srt)).toEqual([
      { startMs: 1500, text: 'First line' },
      { startMs: 62250, text: 'Second line' },
    ])
    expect(parseSrt('')).toEqual([])
    const notes = ['1', '00:00:01,000 --> 00:00:02,000', '♪♪♪', '', '2', '00:00:03,000 --> 00:00:04,000', '♪ Sung ♪', ''].join(LINE)
    expect(parseSrt(notes)).toEqual([
      { startMs: 1000, text: '♪' },
      { startMs: 3000, text: 'Sung' },
    ])
  })

  test('finds the line being sung', () => {
    const cues = [
      { startMs: 1000, text: 'a' },
      { startMs: 5000, text: 'b' },
    ]
    expect(cueIndexAt(cues, 0)).toBe(-1)
    expect(cueIndexAt(cues, 1000)).toBe(0)
    expect(cueIndexAt(cues, 4999)).toBe(0)
    expect(cueIndexAt(cues, 90000)).toBe(1)
  })

  test('splits plain lyrics into stanzas', () => {
    expect(stanzasOf(`${BOM}one\r\ntwo\r\n\r\n\r\nthree\n`)).toEqual(['one\ntwo', 'three'])
    expect(stanzasOf('')).toEqual([])
  })

  test('reads the position and the length the player script reports', () => {
    const lines = ['@len 211.248', '@pos 10.041', '@len 211.248', '@pos 10.292', ''].join(CRLF)
    expect(reportOf(lines)).toEqual({ positionMs: 10292, lengthMs: 211248 })
    expect(reportOf('@pos 3')).toEqual({ positionMs: 3000 })
    expect(reportOf('[ffmpeg] No such file or directory')).toEqual({})
  })

  test("reads the track number and the album's cover", () => {
    expect(splitTitle('07 - Neo')).toEqual({ number: '07', name: 'Neo' })
    expect(splitTitle('Song - Live')).toEqual({ number: '', name: 'Song - Live' })
    expect(coverOf(['/a/back.jpg', '/a/Portada.png', '/a/song.mp3'])).toBe('/a/Portada.png')
    expect(coverOf(['/a/b.webp', '/a/a.jpg'])).toBe('/a/a.jpg')
    expect(coverOf(['/a/song.mp3'])).toBeUndefined()
    expect(hashOf('D:/Music/Album/Portada.png')).toBe(hashOf('D:/Music/Album/Portada.png'))
    expect(hashOf('a')).not.toBe(hashOf('b'))
  })

  test('formats the time and the YouTube search', () => {
    expect(clockOf(0)).toBe('0:00')
    expect(clockOf(62999)).toBe('1:02')
    expect(youtubeUrlOf('Band', '01 - Song Name')).toBe('https://www.youtube.com/results?search_query=Band%20Song%20Name')
    expect(youtubeUrlOf(' ', '07 - Neo')).toBe('https://www.youtube.com/results?search_query=Neo')
  })

  test('picks the locale from the language setting', () => {
    expect(localeOf('Español')).toBe('es')
    expect(localeOf('es-EC')).toBe('es')
    expect(localeOf('spanish')).toBe('es')
    expect(localeOf('Deutsch')).toBe('en')
    expect(localeOf(undefined)).toBe('en')
    expect(translate('es', 'libraryMissing', { path: 'D:\\Music' })).toBe('No se puede leer la carpeta de música D:\\Music.')
    expect(translate('en', 'playerFailed', { player: 'ffplay' })).toBe('ffplay could not play {title}.')
  })
})
