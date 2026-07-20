import { MANUAL_INSTALL_MESSAGE, type CommandProfile, type InstallCommandMetadata, type InstallPlatform } from './profiles'

export type CommandAvailabilityState = 'unknown' | 'installed' | 'missing' | 'installing' | 'install-failed'
export type SetupConfirmationHandler = (message: string) => boolean

export interface CommandAvailabilityResult {
  profileId: string
  executableName: string | null
  platform: string
  state: Extract<CommandAvailabilityState, 'installed' | 'missing' | 'unknown'>
  resolvedExecutable: string | null
  checkedAt: string
}

export interface SetupInstallActionState {
  installCommand: InstallCommandMetadata | null
  canInstall: boolean
  canCopy: boolean
  manualMessage: string | null
}

export interface SetupInstallConfirmationDetails {
  title: string
  profileName: string
  executableName: string
  operatingSystem: string
  command: string
  source: string
  sourceUrl: string
  warning: string
}

export type CommandResolver = (
  executableName: string,
  profile: CommandProfile,
  platform: string
) => string | null

export function getProfileExecutableName(profile: CommandProfile): string | null {
  const executableName = profile.setup?.executableName ?? profile.command
  const trimmed = executableName.trim()

  return trimmed.length > 0 ? trimmed : null
}

export function isSetupManagedBuiltInProfile(profile: CommandProfile): boolean {
  return Boolean(profile.builtIn && profile.setup)
}

export function checkCommandProfileAvailability(
  profile: CommandProfile,
  platform: string,
  resolveCommand: CommandResolver,
  checkedAt = new Date().toISOString()
): CommandAvailabilityResult {
  const executableName = getProfileExecutableName(profile)

  if (!executableName) {
    return {
      profileId: profile.id,
      executableName: null,
      platform,
      state: 'unknown',
      resolvedExecutable: null,
      checkedAt
    }
  }

  const resolvedExecutable = resolveCommand(executableName, profile, platform)

  return {
    profileId: profile.id,
    executableName,
    platform,
    state: resolvedExecutable ? 'installed' : 'missing',
    resolvedExecutable,
    checkedAt
  }
}

export function getInstallPlatform(platform: string): InstallPlatform | null {
  if (platform === 'win32') {
    return 'windows'
  }

  if (platform === 'linux') {
    return 'linux'
  }

  if (platform === 'darwin') {
    return 'macos'
  }

  return null
}

export function getInstallCommandForPlatform(
  profile: CommandProfile,
  platform: string
): InstallCommandMetadata | null {
  const installPlatform = getInstallPlatform(platform)

  if (!installPlatform) {
    return null
  }

  return profile.setup?.installCommands?.[installPlatform] ?? null
}

export function getSetupInstallActionState(
  profile: CommandProfile,
  platform: string,
  state: CommandAvailabilityState
): SetupInstallActionState {
  const installCommand = getInstallCommandForPlatform(profile, platform)
  const hasVerifiedCommand = installCommand?.trust === 'verified'
  const canRun = Boolean(hasVerifiedCommand && state !== 'installing')

  return {
    installCommand,
    canInstall: canRun,
    canCopy: Boolean(hasVerifiedCommand),
    manualMessage: hasVerifiedCommand ? null : profile.setup ? MANUAL_INSTALL_MESSAGE : null
  }
}

export function formatInstallPlatform(platform: string): string {
  if (platform === 'win32') {
    return 'Windows'
  }

  if (platform === 'linux') {
    return 'Linux'
  }

  if (platform === 'darwin') {
    return 'macOS'
  }

  return platform === 'unknown' ? 'Unknown' : platform
}

export function createSetupConfirmationMessage(
  profile: CommandProfile,
  platform: string,
  installCommand: InstallCommandMetadata
): string {
  const details = createSetupConfirmationDetails(profile, platform, installCommand)

  return [
    details.title,
    '',
    `Profile: ${details.profileName}`,
    `Expected executable: ${details.executableName}`,
    `Operating system: ${details.operatingSystem}`,
    `Exact command: ${details.command}`,
    `Official docs/source: ${details.sourceUrl}`,
    '',
    details.warning
  ].join('\n')
}

export function createSetupConfirmationDetails(
  profile: CommandProfile,
  platform: string,
  installCommand: InstallCommandMetadata
): SetupInstallConfirmationDetails {
  return {
    title: `Install/setup ${profile.name}?`,
    profileName: profile.name,
    executableName: profile.setup?.executableName ?? profile.command,
    operatingSystem: formatInstallPlatform(platform),
    command: installCommand.command,
    source: installCommand.source,
    sourceUrl: installCommand.sourceUrl,
    warning: `Provider/source warning: This command comes from ${installCommand.source}. WindowPanes will run it in a visible terminal pane and will not collect credentials or provider API keys.`
  }
}

export function confirmSetupInstallExecution(
  profile: CommandProfile,
  platform: string,
  installCommand: InstallCommandMetadata,
  confirm: SetupConfirmationHandler
): boolean {
  if (installCommand.trust !== 'verified') {
    return false
  }

  return confirm(createSetupConfirmationMessage(profile, platform, installCommand))
}
