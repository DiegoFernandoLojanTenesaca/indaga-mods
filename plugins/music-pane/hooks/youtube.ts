import type { MusicAlbum, MusicSource, MusicTrack } from '../types'

const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'])
const TAGS = /\s*[([][^)\]]*\b(official|lyrics?|audio|video|visualizer)\b[^)\]]*[)\]]\s*$/i
const SEARCH_RESULTS = 8

export type YoutubeEntry = {
  id?: string
  title?: string
  duration?: number | null
  url?: string
  channel?: string | null
  uploader?: string | null
}

export type YoutubeListing = YoutubeEntry & {
  entries?: YoutubeEntry[]
  webpage_url?: string
}

export type YoutubeVideo = {
  url?: string
  duration?: number | null
  subtitles?: Record<string, { ext?: string; url?: string }[]>
}

export function isYoutubeLink(text: string) {
  try {
    const url = new URL(text.trim())
    return url.protocol === 'https:' && HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

export const watchUrlOf = (id: string) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`

export const thumbnailOf = (id: string) => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`

export const mixUrlOf = (id: string) => `${watchUrlOf(id)}&list=RD${encodeURIComponent(id)}`

export const searchOf = (query: string, results = SEARCH_RESULTS) => `ytsearch${results}:${query.trim()}`

export function videoIdOf(page: string) {
  try {
    return new URL(page).searchParams.get('v') ?? undefined
  } catch {
    return undefined
  }
}

export function playlistsUrlOf(channel: string) {
  const trimmed = channel.trim().replace(/\/+$/, '')
  if (trimmed.startsWith('https://')) return trimmed.endsWith('/playlists') ? trimmed : `${trimmed}/playlists`
  return `https://www.youtube.com/${trimmed.startsWith('@') ? trimmed : `@${trimmed}`}/playlists`
}

export function cleanTitle(title: string, artist: string) {
  const bare = title.replace(TAGS, '').trim()
  const lead = `${artist.trim()} - `.toLowerCase()
  return artist.trim() && bare.toLowerCase().startsWith(lead) ? bare.slice(lead.length).trim() : bare
}

export function splitCredit(title: string) {
  const at = title.indexOf(' - ')
  return at > 0 ? { credit: title.slice(0, at).trim(), song: title.slice(at + 3).trim() } : { credit: undefined, song: title }
}

export const durationMsOf = (seconds: number | null | undefined) => (seconds ? Math.round(seconds * 1000) : undefined)

export function channelAlbumsOf(listing: YoutubeListing): MusicAlbum[] {
  return (listing.entries ?? []).flatMap((entry): MusicAlbum[] =>
    entry.url && entry.title
      ? [{ id: entry.url, name: entry.title, source: 'channel', url: entry.url, tracks: [], isLoaded: false }]
      : [],
  )
}

export function youtubeTracksOf(albumId: string, listing: YoutubeListing, artist: string): MusicTrack[] {
  return (listing.entries ?? [listing]).flatMap((entry): MusicTrack[] => {
    if (!entry.id || !entry.title) return []
    const owner = entry.channel ?? entry.uploader ?? undefined
    const { credit, song } = splitCredit(cleanTitle(entry.title, artist))
    return [
      {
        id: watchUrlOf(entry.id),
        album: albumId,
        title: song,
        page: watchUrlOf(entry.id),
        cover: thumbnailOf(entry.id),
        byline: credit ?? owner,
        durationMs: durationMsOf(entry.duration),
      },
    ]
  })
}

export function listingAlbumOf(id: string, name: string, source: MusicSource, tracks: MusicTrack[]): MusicAlbum {
  return { id, name, source, url: source === 'link' ? id : undefined, tracks, isLoaded: true }
}

export function linkAlbumOf(link: string, listing: YoutubeListing, artist: string): MusicAlbum {
  const id = listing.webpage_url ?? link
  const owner = artist || listing.channel || listing.uploader || ''
  const name = listing.entries ? (listing.title ?? link) : cleanTitle(listing.title ?? link, owner)
  return listingAlbumOf(id, name, 'link', youtubeTracksOf(id, listing, artist))
}

export function subtitleUrlOf(video: YoutubeVideo, language: string) {
  const tracks = Object.entries(video.subtitles ?? {})
  const ordered = [...tracks.filter(([code]) => code.split('-')[0] === language), ...tracks]
  return ordered.map(([, formats]) => formats.find(format => format.ext === 'srt')?.url).find(Boolean)
}
