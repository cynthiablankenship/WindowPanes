import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_PROFILES,
  MANUAL_INSTALL_MESSAGE,
  checkCommandProfileAvailability,
  confirmSetupInstallExecution,
  createSetupConfirmationDetails,
  createSetupConfirmationMessage,
  formatInstallPlatform,
  getInstallCommandForPlatform,
  getSetupInstallActionState,
  isSetupManagedBuiltInProfile,
  type CommandProfile,
  type CommandAvailabilityState
} from './index'

const MANAGED_BUILT_IN_IDS = [
  'builtin.claude',
  'builtin.codex',
  'builtin.droid',
  'builtin.opencode',
  'builtin.reasonix',
  'builtin.pi',
  'builtin.hermes',
  'builtin.openclaw'
]

describe('built-in command availability metadata', () => {
  it('defines setup metadata for every managed built-in profile', () => {
    const managedProfiles = BUILT_IN_PROFILES.filter(isSetupManagedBuiltInProfile)

    expect(managedProfiles.map((profile) => profile.id).sort()).toEqual([...MANAGED_BUILT_IN_IDS].sort())

    for (const profile of managedProfiles) {
      expect(profile.setup?.displayName).toBeTruthy()
      expect(profile.setup?.executableName).toBe(profile.command)
      expect(profile.setup?.shortDescription).toBeTruthy()
    }
  })

  it('marks provider profiles without commands as manual-only instead of inventing commands', () => {
    const manualProfile: CommandProfile = {
      id: 'builtin.manual',
      name: 'Manual Agent',
      command: 'manual-agent',
      args: [],
      builtIn: true,
      setup: {
        displayName: 'Manual Agent',
        executableName: 'manual-agent',
        shortDescription: 'Manual-only profile.',
        installMethod: 'manual'
      }
    }
    const manualProfiles = BUILT_IN_PROFILES.filter(
      (profile) => profile.setup?.installMethod === 'manual'
    )

    expect(manualProfiles).toEqual([])
    expect(getInstallCommandForPlatform(manualProfile, 'linux')).toBeNull()
    expect(getSetupInstallActionState(manualProfile, 'linux', 'missing')).toEqual({
      installCommand: null,
      canInstall: false,
      canCopy: false,
      manualMessage: MANUAL_INSTALL_MESSAGE
    })
    expect(MANUAL_INSTALL_MESSAGE).toBe(
      'No verified install command is available for this profile yet. Use the provider’s official instructions, then make sure the executable is on PATH.'
    )
  })

  it('stores verified install commands only for documented profiles and platforms', () => {
    const codex = BUILT_IN_PROFILES.find((profile) => profile.id === 'builtin.codex')
    const claude = BUILT_IN_PROFILES.find((profile) => profile.id === 'builtin.claude')
    const opencode = BUILT_IN_PROFILES.find((profile) => profile.id === 'builtin.opencode')
    const droid = BUILT_IN_PROFILES.find((profile) => profile.id === 'builtin.droid')
    const reasonix = BUILT_IN_PROFILES.find((profile) => profile.id === 'builtin.reasonix')
    const pi = BUILT_IN_PROFILES.find((profile) => profile.id === 'builtin.pi')
    const hermes = BUILT_IN_PROFILES.find((profile) => profile.id === 'builtin.hermes')
    const openclaw = BUILT_IN_PROFILES.find((profile) => profile.id === 'builtin.openclaw')

    expect(codex && getInstallCommandForPlatform(codex, 'win32')).toMatchObject({ trust: 'verified' })
    expect(codex && getInstallCommandForPlatform(codex, 'linux')?.command).toContain('chatgpt.com/codex')
    expect(claude && getInstallCommandForPlatform(claude, 'darwin')?.command).toContain('claude.ai/install.sh')
    expect(opencode && getInstallCommandForPlatform(opencode, 'linux')?.command).toBe(
      'npm install -g opencode-ai'
    )
    expect(droid && getInstallCommandForPlatform(droid, 'win32')?.command).toBe(
      'irm https://app.factory.ai/cli/windows | iex'
    )
    expect(reasonix && getInstallCommandForPlatform(reasonix, 'linux')?.command).toBe(
      'npm install -g reasonix@next'
    )
    expect(pi && getInstallCommandForPlatform(pi, 'darwin')?.command).toBe(
      'npm install -g --ignore-scripts @earendil-works/pi-coding-agent'
    )
    expect(hermes && getInstallCommandForPlatform(hermes, 'win32')?.command).toBe(
      'iex (irm https://hermes-agent.nousresearch.com/install.ps1)'
    )
    expect(openclaw && getInstallCommandForPlatform(openclaw, 'win32')?.command).toBe(
      'iwr -useb https://openclaw.ai/install.ps1 | iex'
    )

    for (const profile of [codex, claude, opencode, droid, reasonix, pi, hermes, openclaw]) {
      expect(profile?.setup?.installMethod).toBe('verified')
      expect(profile?.setup?.verificationCommand).toBe(`${profile?.setup?.executableName} --version`)
      for (const platform of ['win32', 'linux', 'darwin']) {
        const command = profile ? getInstallCommandForPlatform(profile, platform) : null
        expect(command?.sourceUrl).toMatch(/^https:\/\//)
      }
    }
  })

  it('maps supported runtime platforms to install metadata platforms', () => {
    const codex = BUILT_IN_PROFILES.find((profile) => profile.id === 'builtin.codex')

    expect(codex).toBeDefined()
    expect(getInstallCommandForPlatform(codex!, 'win32')?.command).toContain('install.ps1')
    expect(getInstallCommandForPlatform(codex!, 'linux')?.command).toContain('install.sh')
    expect(getInstallCommandForPlatform(codex!, 'darwin')?.command).toContain('install.sh')
    expect(getInstallCommandForPlatform(codex!, 'freebsd')).toBeNull()
    expect(formatInstallPlatform('win32')).toBe('Windows')
    expect(formatInstallPlatform('linux')).toBe('Linux')
    expect(formatInstallPlatform('darwin')).toBe('macOS')
    expect(formatInstallPlatform('unknown')).toBe('Unknown')
  })

  it('checks command availability through a mocked resolver', () => {
    const codex = BUILT_IN_PROFILES.find((profile) => profile.id === 'builtin.codex')

    expect(codex).toBeDefined()

    const installed = checkCommandProfileAvailability(
      codex!,
      'linux',
      (executableName) => (executableName === 'codex' ? '/usr/local/bin/codex' : null),
      '2026-06-16T00:00:00.000Z'
    )
    const missing = checkCommandProfileAvailability(
      codex!,
      'linux',
      () => null,
      '2026-06-16T00:00:00.000Z'
    )

    expect(installed).toMatchObject({
      profileId: 'builtin.codex',
      executableName: 'codex',
      platform: 'linux',
      state: 'installed',
      resolvedExecutable: '/usr/local/bin/codex'
    })
    expect(missing.state).toBe('missing')
  })

  it('uses setup executable metadata instead of a platform launch wrapper when checking availability', () => {
    const wrappedProfile: CommandProfile = {
      id: 'builtin.example',
      name: 'Example',
      command: 'powershell.exe',
      args: ['-NoExit', '-Command', 'example'],
      builtIn: true,
      setup: {
        displayName: 'Example CLI',
        executableName: 'example',
        shortDescription: 'Example CLI profile.',
        installMethod: 'manual'
      }
    }

    const result = checkCommandProfileAvailability(
      wrappedProfile,
      'win32',
      (executableName) => (executableName === 'example' ? 'C:\\tools\\example.cmd' : null),
      '2026-06-16T00:00:00.000Z'
    )

    expect(result).toMatchObject({
      executableName: 'example',
      state: 'installed',
      resolvedExecutable: 'C:\\tools\\example.cmd'
    })
  })

  it('safely handles profiles without setup or install command metadata', () => {
    const genericShell = BUILT_IN_PROFILES.find((profile) => profile.id === 'builtin.shell')
    const manualProfile: CommandProfile = {
      id: 'builtin.manual',
      name: 'Manual Agent',
      command: 'manual-agent',
      args: [],
      builtIn: true,
      setup: {
        displayName: 'Manual Agent',
        executableName: 'manual-agent',
        shortDescription: 'Manual-only profile.',
        installMethod: 'manual'
      }
    }

    expect(genericShell).toBeDefined()
    expect(getInstallCommandForPlatform(genericShell!, 'linux')).toBeNull()
    expect(getInstallCommandForPlatform(manualProfile, 'linux')).toBeNull()

    const result = checkCommandProfileAvailability(
      { ...genericShell!, command: '' },
      'linux',
      () => '/bin/sh',
      '2026-06-16T00:00:00.000Z'
    )

    expect(result).toMatchObject({
      executableName: null,
      state: 'unknown',
      resolvedExecutable: null
    })
  })

  it('enables install and copy only for verified commands on the current OS', () => {
    const openclaw = BUILT_IN_PROFILES.find((profile) => profile.id === 'builtin.openclaw')
    const manualProfile: CommandProfile = {
      id: 'builtin.manual',
      name: 'Manual Agent',
      command: 'manual-agent',
      args: [],
      builtIn: true,
      setup: {
        displayName: 'Manual Agent',
        executableName: 'manual-agent',
        shortDescription: 'Manual-only profile.',
        installMethod: 'manual'
      }
    }

    expect(openclaw).toBeDefined()
    expect(getSetupInstallActionState(openclaw!, 'win32', 'missing')).toMatchObject({
      canInstall: true,
      canCopy: true,
      manualMessage: null
    })
    expect(getSetupInstallActionState(openclaw!, 'win32', 'installing')).toMatchObject({
      canInstall: false,
      canCopy: true,
      manualMessage: null
    })
    expect(getSetupInstallActionState(openclaw!, 'freebsd', 'missing')).toEqual({
      installCommand: null,
      canInstall: false,
      canCopy: false,
      manualMessage: MANUAL_INSTALL_MESSAGE
    })
    expect(getSetupInstallActionState(manualProfile, 'linux', 'missing')).toEqual({
      installCommand: null,
      canInstall: false,
      canCopy: false,
      manualMessage: MANUAL_INSTALL_MESSAGE
    })
  })

  it('builds the setup confirmation text with the exact command and source warning', () => {
    const codex = BUILT_IN_PROFILES.find((profile) => profile.id === 'builtin.codex')
    const installCommand = codex ? getInstallCommandForPlatform(codex, 'win32') : null

    expect(codex).toBeDefined()
    expect(installCommand).toBeDefined()

    const message = createSetupConfirmationMessage(codex!, 'win32', installCommand!)

    expect(message).toContain('Install/setup Codex CLI?')
    expect(message).toContain('Expected executable: codex')
    expect(message).toContain('Operating system: Windows')
    expect(message).toContain(`Exact command: ${installCommand!.command}`)
    expect(message).toContain(`Official docs/source: ${installCommand!.sourceUrl}`)
    expect(message).toContain(`This command comes from ${installCommand!.source}`)
    expect(message).toContain('visible terminal pane')
    expect(message).toContain('will not collect credentials or provider API keys')
  })

  it('exposes setup confirmation metadata for themed install dialogs', () => {
    const openclaw = BUILT_IN_PROFILES.find((profile) => profile.id === 'builtin.openclaw')
    const installCommand = openclaw ? getInstallCommandForPlatform(openclaw, 'win32') : null

    expect(openclaw).toBeDefined()
    expect(installCommand).toBeDefined()

    const details = createSetupConfirmationDetails(openclaw!, 'win32', installCommand!)

    expect(details).toEqual({
      title: 'Install/setup OpenClaw?',
      profileName: 'OpenClaw',
      executableName: 'openclaw',
      operatingSystem: 'Windows',
      command: installCommand!.command,
      source: installCommand!.source,
      sourceUrl: installCommand!.sourceUrl,
      warning: expect.stringContaining('Provider/source warning')
    })
    expect(details.warning).toContain('visible terminal pane')
    expect(details.warning).toContain('will not collect credentials or provider API keys')
  })

  it('requires an explicit positive confirmation before setup execution can proceed', () => {
    const codex = BUILT_IN_PROFILES.find((profile) => profile.id === 'builtin.codex')
    const installCommand = codex ? getInstallCommandForPlatform(codex, 'linux') : null
    const prompts: string[] = []

    expect(codex).toBeDefined()
    expect(installCommand).toBeDefined()

    const declined = confirmSetupInstallExecution(codex!, 'linux', installCommand!, (message) => {
      prompts.push(message)
      return false
    })
    const accepted = confirmSetupInstallExecution(codex!, 'linux', installCommand!, (message) => {
      prompts.push(message)
      return true
    })

    expect(declined).toBe(false)
    expect(accepted).toBe(true)
    expect(prompts).toHaveLength(2)
    expect(prompts[0]).toContain(`Exact command: ${installCommand!.command}`)
  })

  it('never treats manual install metadata as runnable through confirmation', () => {
    const manualProfile = BUILT_IN_PROFILES.find((profile) => profile.id === 'builtin.droid')
    const manualCommand = {
      command: 'example install',
      source: 'manual instructions',
      sourceUrl: 'https://example.com/manual',
      trust: 'manual' as const
    }
    let confirmCalled = false

    expect(manualProfile).toBeDefined()

    const result = confirmSetupInstallExecution(manualProfile!, 'linux', manualCommand, () => {
      confirmCalled = true
      return true
    })

    expect(result).toBe(false)
    expect(confirmCalled).toBe(false)
  })

  it('represents all setup states explicitly', () => {
    const states: CommandAvailabilityState[] = [
      'unknown',
      'installed',
      'missing',
      'installing',
      'install-failed'
    ]

    expect(states).toHaveLength(5)
  })
})
