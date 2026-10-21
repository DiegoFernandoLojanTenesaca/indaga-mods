export const THEMES = {
  pink: '#e0457b',
  red: '#f85149',
  orange: '#f0883e',
  yellow: '#d4a72c',
  green: '#3fb950',
  cyan: '#39c5cf',
  blue: '#4f8ff7',
  purple: '#a371f7',
}

export type ThemeName = keyof typeof THEMES

export const DEFAULT_THEME: ThemeName = 'pink'

export const isTheme = (value: unknown): value is ThemeName => typeof value === 'string' && value in THEMES

export const PALETTE = {
  problem: '#e5a50a',
  barTrack: '#4a4a4a',
  welcomeBase: '#18181b',
  welcomeInk: '#ffffff',
}
