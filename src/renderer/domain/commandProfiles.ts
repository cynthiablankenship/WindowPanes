import { BUILT_IN_PROFILES, type CommandProfile } from '../../shared'

export type CommandProfileDraft = {
  name: string
  command: string
  args?: string | string[]
  cwd?: string
  env?: Record<string, string>
}

export const CUSTOM_PROFILE_PREFIX = 'profile.custom'

export function createEmptyCommandProfileDraft(): CommandProfileDraft {
  return {
    name: '',
    command: '',
    args: '',
    cwd: '',
    env: {}
  }
}

export function getAvailableCommandProfiles(userProfiles: readonly CommandProfile[]): CommandProfile[] {
  const customProfiles = userProfiles
    .map(normalizeCustomCommandProfile)
    .filter((profile): profile is CommandProfile => profile !== null)

  return [...BUILT_IN_PROFILES, ...customProfiles]
}

export function getPersistableCommandProfiles(profiles: readonly CommandProfile[]): CommandProfile[] {
  return profiles
    .map(normalizeCustomCommandProfile)
    .filter((profile): profile is CommandProfile => profile !== null)
}

export function deleteCustomCommandProfile(
  profiles: readonly CommandProfile[],
  profileId: string
): CommandProfile[] {
  const profile = profiles.find((candidate) => candidate.id === profileId)

  if (!profile || profile.builtIn) {
    return [...profiles]
  }

  return profiles.filter((candidate) => candidate.id !== profileId)
}

export function createCustomCommandProfile(draft: CommandProfileDraft): CommandProfile {
  const name = draft.name.trim()
  const command = draft.command.trim()

  if (!name) {
    throw new Error('Command profile name is required.')
  }

  if (!command) {
    throw new Error('Command profile command is required.')
  }

  return {
    id: `${CUSTOM_PROFILE_PREFIX}.${slugify(name)}.${Date.now().toString(36)}`,
    name,
    command,
    args: normalizeArgs(draft.args),
    cwd: optionalTrim(draft.cwd),
    env: normalizeEnv(draft.env),
    builtIn: false
  }
}

export function findCommandProfile(
  profiles: readonly CommandProfile[],
  profileId: string | null
): CommandProfile | undefined {
  if (!profileId) {
    return undefined
  }

  return profiles.find((profile) => profile.id === profileId)
}

export function isCommandPathLikeProfileName(name: string): boolean {
  const normalized = name.trim()

  return (
    /^c:\\/i.test(normalized) ||
    /\\system32\\/i.test(normalized) ||
    /\.(exe|cmd|ps1|bat)$/i.test(normalized)
  )
}

function normalizeArgs(args: unknown): string[] {
  if (Array.isArray(args)) {
    return args.map((arg) => String(arg).trim()).filter(Boolean)
  }

  if (typeof args !== 'string') {
    return []
  }

  return args
    .split(' ')
    .map((arg) => arg.trim())
    .filter(Boolean)
}

function normalizeCustomCommandProfile(profile: CommandProfile): CommandProfile | null {
  if (profile.builtIn) {
    return null
  }

  const id = optionalTrim(profile.id)

  if (!id) {
    return null
  }

  const command = optionalTrim(profile.command) ?? ''
  const name = optionalTrim(profile.name) ?? optionalTrim(profile.command) ?? id

  return {
    id,
    name,
    command,
    args: normalizeArgs(profile.args),
    cwd: optionalTrim(profile.cwd),
    env: normalizeEnv(profile.env),
    builtIn: false
  }
}

function normalizeEnv(env: unknown): Record<string, string> | undefined {
  if (!env || typeof env !== 'object' || Array.isArray(env)) {
    return undefined
  }

  const entries = Object.entries(env as Record<string, unknown>)
    .map(([key, value]) => [key.trim(), String(value).trim()] as const)
    .filter(([key]) => key.length > 0)

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function optionalTrim(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'command'
}
