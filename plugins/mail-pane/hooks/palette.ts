export const THEMES = {
  blue: '#4f8ff7',
  cyan: '#39c5cf',
  green: '#3fb950',
  yellow: '#d4a72c',
  orange: '#f0883e',
  red: '#f85149',
  pink: '#e0457b',
  purple: '#a371f7',
}

export type ThemeName = keyof typeof THEMES

export const DEFAULT_THEME: ThemeName = 'blue'

export const isTheme = (value: unknown): value is ThemeName => typeof value === 'string' && value in THEMES

export const PALETTE = {
  problem: '#e5a50a',
  bannerBase: '#18181b',
  bannerInk: '#ffffff',
}
