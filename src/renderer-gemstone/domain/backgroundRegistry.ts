import type { GemstoneBackground } from './gemstoneState'

export type GemstoneBackgroundType = 'css' | 'svg' | 'image' | 'webgl'
export type GemstoneBackgroundSuitability = 'light' | 'dark' | 'both'

export interface GemstoneBackgroundDefinition {
  id: GemstoneBackground
  name: string
  shortDescription: string
  type: GemstoneBackgroundType
  suitability: GemstoneBackgroundSuitability
  opacity: number
  intensity: number
  softenPx?: number
  experimental: boolean
  debugOnly?: boolean
  default: boolean
  assetPath?: string
}

export const GEMSTONE_BACKGROUND_REGISTRY = [
  {
    id: 'simple-glass',
    name: 'Simple Glass',
    shortDescription: 'Clean low-noise glass field for readable daily use.',
    type: 'css',
    suitability: 'light',
    opacity: 0.64,
    intensity: 0.72,
    softenPx: 14,
    experimental: false,
    default: true
  },
  {
    id: 'simple-diamond',
    name: 'Simple Diamond',
    shortDescription: 'Clean quiet diamond and ice palette using the Simple Glass structure.',
    type: 'css',
    suitability: 'light',
    opacity: 0.64,
    intensity: 0.72,
    softenPx: 14,
    experimental: false,
    default: false
  },
  {
    id: 'simple-onyx',
    name: 'Simple Onyx',
    shortDescription: 'Clean quiet onyx palette using the Simple Glass structure.',
    type: 'css',
    suitability: 'dark',
    opacity: 0.58,
    intensity: 0.62,
    softenPx: 14,
    experimental: false,
    default: false
  },
  {
    id: 'simple-amethyst',
    name: 'Simple Amethyst',
    shortDescription: 'Clean quiet amethyst palette using the Simple Glass structure.',
    type: 'css',
    suitability: 'both',
    opacity: 0.62,
    intensity: 0.68,
    softenPx: 14,
    experimental: false,
    default: false
  },
  {
    id: 'simple-cobalt',
    name: 'Simple Cobalt',
    shortDescription: 'Clean quiet cobalt palette using the Simple Glass structure.',
    type: 'css',
    suitability: 'both',
    opacity: 0.62,
    intensity: 0.68,
    softenPx: 14,
    experimental: false,
    default: false
  },
  {
    id: 'simple-emerald',
    name: 'Simple Emerald',
    shortDescription: 'Clean quiet emerald palette using the Simple Glass structure.',
    type: 'css',
    suitability: 'both',
    opacity: 0.62,
    intensity: 0.68,
    softenPx: 14,
    experimental: false,
    default: false
  },
  {
    id: 'simple-ruby',
    name: 'Simple Ruby',
    shortDescription: 'Clean quiet ruby palette using the Simple Glass structure.',
    type: 'css',
    suitability: 'both',
    opacity: 0.62,
    intensity: 0.68,
    softenPx: 14,
    experimental: false,
    default: false
  },
  {
    id: 'simple-opal',
    name: 'Simple Opal',
    shortDescription: 'Clean quiet opal palette using the Simple Glass structure.',
    type: 'css',
    suitability: 'light',
    opacity: 0.64,
    intensity: 0.72,
    softenPx: 14,
    experimental: false,
    default: false
  },
  {
    id: 'original-grid',
    name: 'Original Grid',
    shortDescription: 'Restored structured grid baseline kept as a permanent live option.',
    type: 'css',
    suitability: 'dark',
    opacity: 1,
    intensity: 1,
    softenPx: 0,
    experimental: false,
    default: false
  },
  {
    id: 'dark-glass',
    name: 'Dark Glass',
    shortDescription: 'Legacy dark glass preset retained for reference and old snapshots.',
    type: 'css',
    suitability: 'dark',
    opacity: 0.5,
    intensity: 0.58,
    softenPx: 10,
    experimental: true,
    debugOnly: true,
    default: false
  },
  {
    id: 'custom-local-asset',
    name: 'Custom Background',
    shortDescription: 'Optional local image-backed background slot for future user-owned assets.',
    type: 'image',
    suitability: 'both',
    opacity: 0.56,
    intensity: 0.6,
    softenPx: 8,
    experimental: true,
    debugOnly: true,
    default: false
  },
  {
    id: 'icy-glass-surface',
    name: 'Icy Glass Surface',
    shortDescription: 'Experimental pale frosted glass surface with soft seams and a bright calm center glow.',
    type: 'css',
    suitability: 'both',
    opacity: 0.78,
    intensity: 0.82,
    softenPx: 7,
    experimental: true,
    default: false
  }
] as const satisfies readonly GemstoneBackgroundDefinition[]

export const GEMSTONE_BACKGROUNDS = GEMSTONE_BACKGROUND_REGISTRY.map((background) => background.id)

export const DAILY_GEMSTONE_BACKGROUND_REGISTRY = GEMSTONE_BACKGROUND_REGISTRY.filter(
  (background) => !background.experimental
)

export const REFERENCE_GEMSTONE_BACKGROUND_REGISTRY = GEMSTONE_BACKGROUND_REGISTRY.filter(
  (background) => background.experimental
)

export const DEFAULT_GEMSTONE_BACKGROUND =
  GEMSTONE_BACKGROUND_REGISTRY.find((background) => background.default)?.id ?? 'simple-glass'

export function getGemstoneBackgroundDefinition(background: GemstoneBackground): GemstoneBackgroundDefinition {
  return (
    GEMSTONE_BACKGROUND_REGISTRY.find((candidate) => candidate.id === background) ??
    GEMSTONE_BACKGROUND_REGISTRY.find((candidate) => candidate.default) ??
    GEMSTONE_BACKGROUND_REGISTRY[0]
  )
}

export function getDefaultGemstoneBackground(prefersDark: boolean): GemstoneBackground {
  void prefersDark
  return DEFAULT_GEMSTONE_BACKGROUND
}
