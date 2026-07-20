import {
  BUILT_IN_PROFILES,
  WINDOWS_POWERSHELL_COMMAND,
  normalizeCommandProfileForPlatform,
  type CommandProfile
} from '../../shared'
import {
  createEmptyCommandProfileDraft,
  createCustomCommandProfile,
  deleteCustomCommandProfile,
  getAvailableCommandProfiles,
  getPersistableCommandProfiles,
  isCommandPathLikeProfileName
} from './commandProfiles'

describe('command profile helpers', () => {
  it('merges built-ins with custom profiles at runtime', () => {
    const custom: CommandProfile = {
      id: 'profile.custom.local',
      name: 'Local Script',
      command: 'npm',
      args: ['run', 'dev'],
      cwd: 'C:/work',
      builtIn: false
    }

    const profiles = getAvailableCommandProfiles([custom])

    expect(profiles.slice(0, BUILT_IN_PROFILES.length)).toEqual(BUILT_IN_PROFILES)
    expect(profiles).toContainEqual(custom)
  })

  it('keeps built-in profiles out of persisted command profile metadata', () => {
    const custom = createCustomCommandProfile({
      name: 'Workspace Shell',
      command: 'pwsh',
      args: '-NoLogo',
      env: { ' WORKSPACE_MODE ': ' local ' }
    })

    const profiles = getPersistableCommandProfiles([...BUILT_IN_PROFILES, custom])

    expect(profiles).toHaveLength(1)
    expect(profiles[0]).toMatchObject({
      name: 'Workspace Shell',
      command: 'pwsh',
      args: ['-NoLogo'],
      env: { WORKSPACE_MODE: 'local' },
      builtIn: false
    })
  })

  it('normalizes Windows built-in agent profiles to PowerShell commands', () => {
    const expectedArgsByProfileId: Record<string, string[]> = {
      'builtin.claude': ['-NoLogo', '-NoExit', '-Command', 'claude'],
      'builtin.codex': ['-NoLogo', '-NoExit', '-Command', 'codex'],
      'builtin.droid': ['-NoLogo', '-NoExit', '-Command', 'droid'],
      'builtin.opencode': ['-NoLogo', '-NoExit', '-Command', 'opencode'],
      'builtin.reasonix': ['-NoLogo', '-NoExit', '-Command', 'reasonix'],
      'builtin.pi': ['-NoLogo', '-NoExit', '-Command', 'pi'],
      'builtin.hermes': ['-NoLogo', '-NoExit', '-Command', 'hermes'],
      'builtin.openclaw': ['-NoLogo', '-NoExit', '-Command', 'openclaw']
    }

    expect(Object.keys(expectedArgsByProfileId).sort()).toEqual(
      BUILT_IN_PROFILES.filter((profile) => profile.id !== 'builtin.shell')
        .map((profile) => profile.id)
        .sort()
    )

    for (const profile of BUILT_IN_PROFILES) {
      const expectedArgs = expectedArgsByProfileId[profile.id]

      if (!expectedArgs) {
        continue
      }

      const normalized = normalizeCommandProfileForPlatform(profile, 'win32')

      expect(normalized.command).toBe(WINDOWS_POWERSHELL_COMMAND)
      expect(normalized.command).not.toBe(expectedArgs.at(-1))
      expect(normalized.args).toEqual(expectedArgs)
    }
  })

  it('keeps built-in agent profiles direct on non-Windows platforms', () => {
    for (const profile of BUILT_IN_PROFILES) {
      const normalized = normalizeCommandProfileForPlatform(profile, 'linux')

      expect(normalized.command).toBe(profile.command)
      expect(normalized.args).toEqual(profile.args)
    }
  })

  it('deletes custom profiles without altering unrelated profiles', () => {
    const first = createCustomCommandProfile({ name: 'First', command: 'pwsh' })
    const second = createCustomCommandProfile({ name: 'Second', command: 'codex' })

    const profiles = deleteCustomCommandProfile([first, second], first.id)

    expect(profiles).toEqual([second])
  })

  it('does not delete built-in profiles', () => {
    const profiles = deleteCustomCommandProfile([...BUILT_IN_PROFILES], BUILT_IN_PROFILES[0].id)

    expect(profiles).toEqual(BUILT_IN_PROFILES)
  })

  it('keeps malformed custom profiles visible and deletable', () => {
    const malformed = {
      id: 'profile.custom.malformed',
      name: '',
      command: 'C:\\tools\\agent.exe',
      builtIn: false
    } as CommandProfile

    expect(getAvailableCommandProfiles([malformed])).toContainEqual({
      id: 'profile.custom.malformed',
      name: 'C:\\tools\\agent.exe',
      command: 'C:\\tools\\agent.exe',
      args: [],
      builtIn: false
    })
    expect(getPersistableCommandProfiles([malformed])).toEqual([
      {
        id: 'profile.custom.malformed',
        name: 'C:\\tools\\agent.exe',
        command: 'C:\\tools\\agent.exe',
        args: [],
        builtIn: false
      }
    ])
    expect(deleteCustomCommandProfile([malformed], malformed.id)).toEqual([])
  })

  it('creates a blank draft for clearing the add-profile form', () => {
    expect(createEmptyCommandProfileDraft()).toEqual({
      name: '',
      command: '',
      args: '',
      cwd: '',
      env: {}
    })
  })

  it('detects profile names that look like command paths', () => {
    expect(isCommandPathLikeProfileName('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')).toBe(
      true
    )
    expect(isCommandPathLikeProfileName('C:\\tools\\agent.cmd')).toBe(true)
    expect(isCommandPathLikeProfileName('run-agent.ps1')).toBe(true)
    expect(isCommandPathLikeProfileName('Codex via PowerShell')).toBe(false)
  })
})
