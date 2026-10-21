export type MusicSource = 'local' | 'channel' | 'link' | 'search' | 'radio' | 'history'

export type MusicTrack = {
  id: string
  album: string
  title: string
  audio?: string
  page?: string
  synced?: string
  plain?: string
  cover?: string
  byline?: string
  durationMs?: number
}

export type MusicAlbum = {
  id: string
  name: string
  source: MusicSource
  url?: string
  tracks: MusicTrack[]
  isLoaded: boolean
}

export type MusicCue = {
  startMs: number
  text: string
}

export type MusicLyrics = {
  trackId: string
  cues: MusicCue[]
  stanzas: string[]
}

export type MusicPlayback = {
  albumId: string
  trackId: string
  positionMs: number
  durationMs?: number
  source?: string
  isPlaying: boolean
  isLoading: boolean
}

export type MusicCover = {
  source: string
  data: string
}

export type MusicSuggestion = {
  track: MusicTrack
  line?: string
}

export type MusicBusy = 'album' | 'search' | 'radio'

export type MusicProblem = {
  key: 'libraryMissing' | 'playerFailed' | 'youtubeFailed' | 'nothingFound'
  values?: Record<string, string>
}

declare module 'claude-code' {
  interface McpToolInputs {
    'mcp__music-pane__open': Record<string, never>
    'mcp__music-pane__play': { query: string }
  }

  interface PluginState {
    'music-pane': {
      albums: MusicAlbum[]
      album: string
      playback: MusicPlayback | null
      lyrics: MusicLyrics | null
      cover: MusicCover | null
      busy: MusicBusy | null
      problem: MusicProblem | null
      suggestion: MusicSuggestion | null
      results: string | null
      isRadio: boolean
      theme: string
      volume: number
      history: MusicTrack[]
      played: string[]
    }
  }
}
