const en = {
  title: 'Music',
  commandDescription: 'Open the music player beside the chat',
  commandOpened: 'Music player opened.',
  toolPlaying: 'Playing {title} in the music player.',
  libraryMissing: 'The music folder {path} cannot be read.',
  playerFailed: '{player} could not play {title}.',
  youtubeFailed: 'yt-dlp could not read {url}.',
  nothingFound: 'Nothing found for {query}.',
  idle: 'Search a song, a singer or a line of the lyrics.',
  loading: 'Loading…',
  unknownTime: '--:--',
  subLine: '{byline} · {album}',
  youtubeAlbum: '{name} · YouTube',
  radioAlbum: 'Like {name}',
  cover: 'Cover of {album}',
  progress: '{elapsed} of {total}',
  youtube: 'YouTube',
  searchLabel: 'Search',
  searchPlaceholder: 'A song, a singer, a line of the lyrics, or a YouTube link',
  searchSubmit: 'Search',
  didYouMean: 'Did you mean {title}?',
  didYouMeanLine: 'Did you mean "{line}" ({title})?',
  resultsHeading: 'Results for {query}',
  closeResults: 'Close',
  lyricsHeading: 'Lyrics',
  upNextHeading: 'Up next',
  thenSimilar: 'Then: songs like {name}',
  libraryHeading: 'Library',
  album: 'Album',
  theme: 'Theme',
  radioOn: 'Similar songs next: on',
  radioOff: 'Similar songs next: off',
  noLyrics: 'This song has no lyrics.',
  welcomeSubtitle: 'Search, listen, and similar songs keep coming',
  quickHeading: 'Try',
  recentHeading: 'Played lately',
  recentAlbum: 'Played lately',
  volume: '{level} %',
}

export type MessageKey = keyof typeof en

const es: Record<MessageKey, string> = {
  title: 'Música',
  commandDescription: 'Abre el reproductor de música junto al chat',
  commandOpened: 'Reproductor de música abierto.',
  toolPlaying: 'Sonando {title} en el reproductor.',
  libraryMissing: 'No se puede leer la carpeta de música {path}.',
  playerFailed: '{player} no pudo reproducir {title}.',
  youtubeFailed: 'yt-dlp no pudo leer {url}.',
  nothingFound: 'No se encontró nada para {query}.',
  idle: 'Busca una canción, un cantante o una frase de la letra.',
  loading: 'Cargando…',
  unknownTime: '--:--',
  subLine: '{byline} · {album}',
  youtubeAlbum: '{name} · YouTube',
  radioAlbum: 'Parecidas a {name}',
  cover: 'Portada de {album}',
  progress: '{elapsed} de {total}',
  youtube: 'YouTube',
  searchLabel: 'Buscar',
  searchPlaceholder: 'Una canción, un cantante, una frase de la letra o un enlace de YouTube',
  searchSubmit: 'Buscar',
  didYouMean: '¿Quisiste decir {title}?',
  didYouMeanLine: '¿Quisiste decir «{line}» ({title})?',
  resultsHeading: 'Resultados de {query}',
  closeResults: 'Cerrar',
  lyricsHeading: 'Letra',
  upNextHeading: 'A continuación',
  thenSimilar: 'Después: parecidas a {name}',
  libraryHeading: 'Biblioteca',
  album: 'Disco',
  theme: 'Tema',
  radioOn: 'Seguir con parecidas: sí',
  radioOff: 'Seguir con parecidas: no',
  noLyrics: 'Esta canción no tiene letra.',
  welcomeSubtitle: 'Busca, escucha y siguen llegando canciones parecidas',
  quickHeading: 'Prueba con',
  recentHeading: 'Escuchadas hace poco',
  recentAlbum: 'Escuchadas hace poco',
  volume: '{level} %',
}

const LOCALES = {
  en: { names: ['en', 'english', 'inglés'], messages: en },
  es: { names: ['es', 'español', 'espanol', 'spanish', 'castellano'], messages: es },
}

export type Locale = keyof typeof LOCALES

export const QUICK_PICKS: Record<Locale, string[]> = {
  en: ['Romantic salsa', 'Rock classics', 'Lo-fi to focus', '80s hits'],
  es: ['Salsa romántica', 'Rock en español', 'Lo-fi para concentrarse', 'Éxitos de los 80'],
}

const BASE_LOCALE: Locale = 'en'

export function localeOf(language: string | undefined): Locale {
  const name = (language ?? '').trim().toLowerCase().split(/[-_\s]/)[0] ?? ''
  const found = (Object.keys(LOCALES) as Locale[]).find(locale => LOCALES[locale].names.includes(name))
  return found ?? BASE_LOCALE
}

export const translate = (locale: Locale, key: MessageKey, values: Record<string, string> = {}) =>
  LOCALES[locale].messages[key].replace(/\{(\w+)\}/g, (whole, name: string) => values[name] ?? whole)
