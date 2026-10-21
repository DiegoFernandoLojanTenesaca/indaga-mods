import { describe, expect, test } from 'claude-code/testing'

import { coverFilterOf, progressSvgOf, progressTextOf, welcomeSvgOf } from './art'
import { THEMES } from './palette'
import {
  channelAlbumsOf,
  cleanTitle,
  splitCredit,
  isYoutubeLink,
  linkAlbumOf,
  playlistsUrlOf,
  subtitleUrlOf,
  youtubeTracksOf,
} from './youtube'

describe('youtube', () => {
  test('accepts only https YouTube links', () => {
    expect(isYoutubeLink('https://www.youtube.com/playlist?list=PL1')).toBe(true)
    expect(isYoutubeLink(' https://youtu.be/abc ')).toBe(true)
    expect(isYoutubeLink('http://www.youtube.com/watch?v=abc')).toBe(false)
    expect(isYoutubeLink('https://example.com/watch?v=abc')).toBe(false)
    expect(isYoutubeLink('--exec calc')).toBe(false)
  })

  test("finds a channel's playlists page", () => {
    expect(playlistsUrlOf('@band')).toBe('https://www.youtube.com/@band/playlists')
    expect(playlistsUrlOf('band')).toBe('https://www.youtube.com/@band/playlists')
    expect(playlistsUrlOf('https://www.youtube.com/@band/')).toBe('https://www.youtube.com/@band/playlists')
    expect(playlistsUrlOf('https://www.youtube.com/@band/playlists')).toBe('https://www.youtube.com/@band/playlists')
  })

  test('cleans the artist and the video tags off a title', () => {
    expect(cleanTitle('Band - Song One (Official Lyric Video)', 'Band')).toBe('Song One')
    expect(cleanTitle('band - Song [Official Audio]', 'Band')).toBe('Song')
    expect(cleanTitle('Other - Song (Live)', 'Band')).toBe('Other - Song (Live)')
    expect(cleanTitle('Band - Song (Official Video)', '')).toBe('Band - Song')
  })

  test('reads playlists, their videos and a pasted link', () => {
    const playlists = channelAlbumsOf({
      entries: [{ id: 'PL1', title: 'Live', url: 'https://www.youtube.com/playlist?list=PL1' }, { id: 'PL2' }],
    })
    expect(playlists).toEqual([
      { id: 'https://www.youtube.com/playlist?list=PL1', name: 'Live', source: 'channel', url: 'https://www.youtube.com/playlist?list=PL1', tracks: [], isLoaded: false },
    ])
    const tracks = youtubeTracksOf('A', { entries: [{ id: 'v1', title: 'Band - One (Official Video)', duration: 61.5 }, { title: 'gone' }] }, 'Band')
    expect(tracks).toEqual([
      {
        id: 'https://www.youtube.com/watch?v=v1',
        album: 'A',
        title: 'One',
        page: 'https://www.youtube.com/watch?v=v1',
        cover: 'https://i.ytimg.com/vi/v1/hqdefault.jpg',
        durationMs: 61500,
      },
    ])
    expect(splitCredit('Milo J, Silvio Rodríguez - Luciérnagas')).toEqual({ credit: 'Milo J, Silvio Rodríguez', song: 'Luciérnagas' })
    expect(splitCredit('Lo Mejor De La Salsa')).toEqual({ credit: undefined, song: 'Lo Mejor De La Salsa' })
    const credited = youtubeTracksOf('A', { entries: [{ id: 'v8', title: 'Milo J - Luciérnagas (Official Video)', channel: 'MILO J' }] }, '')
    expect(credited[0]).toMatchObject({ title: 'Luciérnagas', byline: 'Milo J' })
    const owned = youtubeTracksOf('A', { entries: [{ id: 'v7', title: 'Band - Seven (Official Video)', channel: 'Band' }] }, '')
    expect(owned[0]).toMatchObject({ title: 'Seven', byline: 'Band' })
    const single = linkAlbumOf('https://youtu.be/v9', { id: 'v9', title: 'Band - Nine (Lyric Video)', webpage_url: 'https://www.youtube.com/watch?v=v9' }, 'Band')
    expect(single.name).toBe('Nine')
    expect(single.tracks.map(track => track.title)).toEqual(['Nine'])
  })

  test('prefers uploaded srt subtitles in the reader language', () => {
    const video = {
      subtitles: {
        'en-x': [{ ext: 'srt', url: 'https://subs/en' }],
        'es-y': [{ ext: 'vtt', url: 'https://subs/es.vtt' }, { ext: 'srt', url: 'https://subs/es' }],
      },
    }
    expect(subtitleUrlOf(video, 'es')).toBe('https://subs/es')
    expect(subtitleUrlOf(video, 'fr')).toBe('https://subs/en')
    expect(subtitleUrlOf({}, 'es')).toBeUndefined()
  })
})

describe('art', () => {
  test('draws the progress bar', () => {
    expect(progressTextOf(0.5, 8)).toEqual({ done: '━━━━', left: '────' })
    expect(progressTextOf(Number.NaN, 4)).toEqual({ done: '', left: '────' })
    expect(progressSvgOf(0.25, THEMES.cyan)).toContain(`fill="${THEMES.cyan}"`)
    expect(progressSvgOf(0.25, THEMES.cyan)).toContain('width="250"')
    expect(progressSvgOf(2, THEMES.cyan)).toContain('width="1000" height="10" rx')
    expect(welcomeSvgOf('Rock & <Roll>', 'a "b"', THEMES.cyan)).toContain('Rock &amp; &lt;Roll&gt;')
    expect(welcomeSvgOf('Music', 'a "b"', THEMES.cyan)).toContain('a &quot;b&quot;')
    expect(coverFilterOf(480, 300)).toBe('scale=480:300:force_original_aspect_ratio=increase,crop=480:300')
  })
})
