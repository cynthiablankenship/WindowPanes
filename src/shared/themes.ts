export type ColorModePreference = 'system' | 'light' | 'dark'
export type ResolvedColorMode = 'light' | 'dark'

export type GemThemeId =
  | 'diamond'
  | 'onyx'
  | 'opal'
  | 'amethyst'
  | 'emerald'
  | 'ruby'
  | 'cobalt'

export type GlassThemePreference = 'auto' | GemThemeId
export type GlassMaterialId = GemThemeId
export type GlassMaterialPreference = 'follow-system' | GlassMaterialId

export interface GlassThemeTokens {
  appBackground: string
  stageBackground: string
  sidebarBackground: string
  paneSurface: string
  paneSurfaceStrong: string
  paneHeader: string
  paneBody: string
  paneBorder: string
  paneBorderStrong: string
  paneHighlight: string
  paneGlow: string
  accent: string
  accentDeep: string
  accentSoft: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  hoverSurface: string
  activeSurface: string
  terminalBackground: string
}

export interface GlassThemeDefinition {
  id: GemThemeId
  name: string
  defaultMode: ResolvedColorMode
  tokens: GlassThemeTokens
}

export const DEFAULT_LIGHT_GLASS_THEME: GemThemeId = 'diamond'
export const DEFAULT_DARK_GLASS_THEME: GemThemeId = 'onyx'
export const DEFAULT_GLASS_MATERIAL: GlassMaterialPreference = 'follow-system'

export const GLASS_THEMES: readonly GlassThemeDefinition[] = [
  {
    id: 'diamond',
    name: 'Diamond',
    defaultMode: 'light',
    tokens: {
      appBackground: '#ecf8ff',
      stageBackground: '#e8f7ff',
      sidebarBackground: 'rgba(238, 249, 255, 0.88)',
      paneSurface: 'rgba(244, 252, 255, 0.56)',
      paneSurfaceStrong: 'rgba(250, 254, 255, 0.78)',
      paneHeader: 'rgba(241, 250, 255, 0.66)',
      paneBody: 'rgba(235, 248, 255, 0.36)',
      paneBorder: 'rgba(104, 176, 217, 0.34)',
      paneBorderStrong: 'rgba(57, 152, 207, 0.58)',
      paneHighlight: 'rgba(255, 255, 255, 0.82)',
      paneGlow: 'rgba(94, 190, 255, 0.26)',
      accent: '#1e9ad1',
      accentDeep: '#0f6f9f',
      accentSoft: 'rgba(30, 154, 209, 0.12)',
      textPrimary: '#102433',
      textSecondary: '#466273',
      textMuted: '#6f8795',
      hoverSurface: 'rgba(223, 245, 255, 0.76)',
      activeSurface: 'rgba(193, 232, 251, 0.82)',
      terminalBackground: '#071019'
    }
  },
  {
    id: 'onyx',
    name: 'Onyx',
    defaultMode: 'dark',
    tokens: {
      appBackground: '#05080c',
      stageBackground: '#070b11',
      sidebarBackground: 'rgba(8, 13, 20, 0.96)',
      paneSurface: 'rgba(14, 24, 35, 0.72)',
      paneSurfaceStrong: 'rgba(13, 22, 32, 0.9)',
      paneHeader: 'rgba(9, 16, 24, 0.88)',
      paneBody: 'rgba(5, 10, 16, 0.34)',
      paneBorder: 'rgba(168, 205, 225, 0.18)',
      paneBorderStrong: 'rgba(118, 216, 255, 0.42)',
      paneHighlight: 'rgba(255, 255, 255, 0.08)',
      paneGlow: 'rgba(117, 217, 255, 0.18)',
      accent: '#75d9ff',
      accentDeep: '#39a9dc',
      accentSoft: 'rgba(117, 217, 255, 0.13)',
      textPrimary: '#eef7fa',
      textSecondary: '#aebfca',
      textMuted: '#768a99',
      hoverSurface: 'rgba(24, 45, 61, 0.78)',
      activeSurface: 'rgba(31, 85, 112, 0.84)',
      terminalBackground: '#070c11'
    }
  },
  {
    id: 'opal',
    name: 'Opal',
    defaultMode: 'light',
    tokens: {
      appBackground: '#f4fbfa',
      stageBackground: '#eefbf9',
      sidebarBackground: 'rgba(245, 253, 251, 0.88)',
      paneSurface: 'rgba(249, 255, 253, 0.58)',
      paneSurfaceStrong: 'rgba(255, 255, 255, 0.78)',
      paneHeader: 'rgba(247, 255, 253, 0.68)',
      paneBody: 'rgba(233, 250, 247, 0.38)',
      paneBorder: 'rgba(91, 174, 162, 0.32)',
      paneBorderStrong: 'rgba(44, 155, 141, 0.52)',
      paneHighlight: 'rgba(255, 255, 255, 0.76)',
      paneGlow: 'rgba(98, 221, 204, 0.23)',
      accent: '#2b9d90',
      accentDeep: '#17766d',
      accentSoft: 'rgba(43, 157, 144, 0.12)',
      textPrimary: '#14312f',
      textSecondary: '#496a67',
      textMuted: '#718986',
      hoverSurface: 'rgba(224, 250, 246, 0.76)',
      activeSurface: 'rgba(196, 238, 232, 0.82)',
      terminalBackground: '#071210'
    }
  },
  {
    id: 'amethyst',
    name: 'Amethyst',
    defaultMode: 'dark',
    tokens: {
      appBackground: '#100915',
      stageBackground: '#140b1c',
      sidebarBackground: 'rgba(18, 11, 27, 0.94)',
      paneSurface: 'rgba(35, 21, 50, 0.7)',
      paneSurfaceStrong: 'rgba(28, 18, 41, 0.88)',
      paneHeader: 'rgba(26, 16, 38, 0.86)',
      paneBody: 'rgba(19, 10, 29, 0.4)',
      paneBorder: 'rgba(211, 176, 255, 0.2)',
      paneBorderStrong: 'rgba(188, 126, 255, 0.48)',
      paneHighlight: 'rgba(255, 255, 255, 0.08)',
      paneGlow: 'rgba(194, 126, 255, 0.22)',
      accent: '#c88aff',
      accentDeep: '#8b54c8',
      accentSoft: 'rgba(200, 138, 255, 0.14)',
      textPrimary: '#fbf6ff',
      textSecondary: '#cbb7de',
      textMuted: '#927ba7',
      hoverSurface: 'rgba(53, 31, 75, 0.8)',
      activeSurface: 'rgba(84, 45, 121, 0.84)',
      terminalBackground: '#0b0710'
    }
  },
  {
    id: 'emerald',
    name: 'Emerald',
    defaultMode: 'dark',
    tokens: {
      appBackground: '#04100d',
      stageBackground: '#061512',
      sidebarBackground: 'rgba(5, 20, 17, 0.94)',
      paneSurface: 'rgba(12, 42, 35, 0.68)',
      paneSurfaceStrong: 'rgba(9, 33, 28, 0.88)',
      paneHeader: 'rgba(8, 31, 27, 0.86)',
      paneBody: 'rgba(4, 18, 15, 0.42)',
      paneBorder: 'rgba(115, 231, 194, 0.2)',
      paneBorderStrong: 'rgba(72, 214, 168, 0.48)',
      paneHighlight: 'rgba(255, 255, 255, 0.07)',
      paneGlow: 'rgba(69, 230, 177, 0.2)',
      accent: '#5fe1b4',
      accentDeep: '#239c78',
      accentSoft: 'rgba(95, 225, 180, 0.13)',
      textPrimary: '#ecfff9',
      textSecondary: '#aad3c6',
      textMuted: '#6f9588',
      hoverSurface: 'rgba(18, 58, 49, 0.78)',
      activeSurface: 'rgba(23, 91, 73, 0.84)',
      terminalBackground: '#04100d'
    }
  },
  {
    id: 'ruby',
    name: 'Ruby',
    defaultMode: 'dark',
    tokens: {
      appBackground: '#13070a',
      stageBackground: '#18080d',
      sidebarBackground: 'rgba(24, 9, 14, 0.94)',
      paneSurface: 'rgba(54, 20, 27, 0.7)',
      paneSurfaceStrong: 'rgba(43, 16, 23, 0.88)',
      paneHeader: 'rgba(39, 14, 21, 0.86)',
      paneBody: 'rgba(24, 8, 13, 0.42)',
      paneBorder: 'rgba(255, 160, 176, 0.22)',
      paneBorderStrong: 'rgba(255, 100, 130, 0.5)',
      paneHighlight: 'rgba(255, 255, 255, 0.07)',
      paneGlow: 'rgba(255, 92, 125, 0.22)',
      accent: '#ff7f9e',
      accentDeep: '#bd3656',
      accentSoft: 'rgba(255, 127, 158, 0.14)',
      textPrimary: '#fff2f5',
      textSecondary: '#e3b4bf',
      textMuted: '#a97885',
      hoverSurface: 'rgba(80, 28, 39, 0.78)',
      activeSurface: 'rgba(124, 37, 57, 0.82)',
      terminalBackground: '#0f0609'
    }
  },
  {
    id: 'cobalt',
    name: 'Cobalt',
    defaultMode: 'dark',
    tokens: {
      appBackground: '#06101b',
      stageBackground: '#071525',
      sidebarBackground: 'rgba(7, 17, 31, 0.94)',
      paneSurface: 'rgba(13, 38, 67, 0.7)',
      paneSurfaceStrong: 'rgba(10, 31, 56, 0.9)',
      paneHeader: 'rgba(9, 29, 52, 0.86)',
      paneBody: 'rgba(5, 17, 31, 0.42)',
      paneBorder: 'rgba(125, 190, 255, 0.22)',
      paneBorderStrong: 'rgba(72, 158, 255, 0.5)',
      paneHighlight: 'rgba(255, 255, 255, 0.08)',
      paneGlow: 'rgba(67, 153, 255, 0.22)',
      accent: '#69b5ff',
      accentDeep: '#2776c7',
      accentSoft: 'rgba(105, 181, 255, 0.14)',
      textPrimary: '#f0f8ff',
      textSecondary: '#b1c9df',
      textMuted: '#7892aa',
      hoverSurface: 'rgba(20, 55, 95, 0.8)',
      activeSurface: 'rgba(29, 79, 135, 0.84)',
      terminalBackground: '#06101a'
    }
  }
] as const

export function resolveGlassThemePreference(
  preference: GlassThemePreference | undefined,
  colorMode: ResolvedColorMode
): GemThemeId {
  if (preference && preference !== 'auto') {
    return preference
  }

  return colorMode === 'dark' ? DEFAULT_DARK_GLASS_THEME : DEFAULT_LIGHT_GLASS_THEME
}

export function migrateGlassMaterialPreference(
  material: GlassMaterialPreference | undefined,
  legacyTheme?: GlassThemePreference
): GlassMaterialPreference {
  if (material) {
    return material
  }

  if (legacyTheme && legacyTheme !== 'auto') {
    return legacyTheme
  }

  return DEFAULT_GLASS_MATERIAL
}

export function resolveGlassMaterialPreference(
  preference: GlassMaterialPreference | undefined,
  systemPrefersDark: boolean
): GemThemeId {
  const material = migrateGlassMaterialPreference(preference)

  if (material !== 'follow-system') {
    return material
  }

  return systemPrefersDark ? DEFAULT_DARK_GLASS_THEME : DEFAULT_LIGHT_GLASS_THEME
}

export function getGlassMaterialColorMode(materialId: GlassMaterialId): ResolvedColorMode {
  return GLASS_THEMES.find((theme) => theme.id === materialId)?.defaultMode ?? 'light'
}
