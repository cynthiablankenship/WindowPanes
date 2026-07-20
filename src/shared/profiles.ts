/**
 * Command profiles describe *what* to launch in a pane. They are pure
 * launch metadata — a command plus arguments. The workspace is a neutral
 * terminal host: it never injects prompts, wraps commands, or proxies the
 * underlying CLI. See docs/ARCHITECTURE.md (Provider-boundary rules).
 */

/** A launchable command. The unit tom spawns and bob assigns to a pane. */
export interface CommandProfile {
  /** Stable id used to reference the profile from a LayoutProfile. */
  id: string
  /** Human-readable label shown in the UI. */
  name: string
  /** Executable to launch (resolved via PATH by node-pty). */
  command: string
  /** Arguments passed verbatim. The host adds nothing of its own. */
  args: string[]
  /** Working directory. Defaults to the user's home dir when omitted. */
  cwd?: string
  /**
   * Extra environment variables merged over the inherited process env.
   * Intended for user-set, non-secret config only. The host never injects
   * API keys or provider credentials here.
   */
  env?: Record<string, string>
  /** True for the shipped defaults below; false/undefined for user profiles. */
  builtIn?: boolean
  /** Optional install/setup metadata. Only shipped built-ins use this. */
  setup?: CommandProfileSetupMetadata
}

export const WINDOWS_POWERSHELL_COMMAND = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'

export type InstallPlatform = 'windows' | 'linux' | 'macos'
export type InstallCommandTrust = 'verified' | 'manual'
export type InstallMethodStatus = 'verified' | 'manual' | 'unknown'

export interface InstallCommandMetadata {
  /** Shell command shown to the user before it can be run. */
  command: string
  /** Human-readable source used in the provider-source warning. */
  source: string
  /** Official/project-owned URL used to verify the install command. */
  sourceUrl: string
  /** Whether this command is verified from official/project-owned docs. */
  trust: InstallCommandTrust
}

export interface CommandProfileSetupMetadata {
  displayName: string
  executableName: string
  shortDescription: string
  installHelpUrl?: string
  installCommands?: Partial<Record<InstallPlatform, InstallCommandMetadata>>
  verificationCommand?: string
  loginSetupNote?: string
  installMethod: InstallMethodStatus
}

const WINDOWS_BUILT_IN_AGENT_COMMANDS: Record<string, string> = {
  'builtin.claude': 'claude',
  'builtin.codex': 'codex',
  'builtin.droid': 'droid',
  'builtin.opencode': 'opencode',
  'builtin.reasonix': 'reasonix',
  'builtin.pi': 'pi',
  'builtin.hermes': 'hermes',
  'builtin.openclaw': 'openclaw'
}

export const MANUAL_INSTALL_MESSAGE =
  "No verified install command is available for this profile yet. Use the provider’s official instructions, then make sure the executable is on PATH."

const CODEX_SETUP: CommandProfileSetupMetadata = {
  displayName: 'Codex CLI',
  executableName: 'codex',
  shortDescription: 'OpenAI Codex terminal coding agent.',
  installHelpUrl: 'https://developers.openai.com/codex/quickstart',
  installCommands: {
    windows: {
      command: 'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"',
      source: 'OpenAI Codex CLI official documentation',
      sourceUrl: 'https://developers.openai.com/codex/quickstart',
      trust: 'verified'
    },
    linux: {
      command: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
      source: 'OpenAI Codex CLI official documentation',
      sourceUrl: 'https://developers.openai.com/codex/quickstart',
      trust: 'verified'
    },
    macos: {
      command: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
      source: 'OpenAI Codex CLI official documentation',
      sourceUrl: 'https://developers.openai.com/codex/quickstart',
      trust: 'verified'
    }
  },
  verificationCommand: 'codex --version',
  loginSetupNote: 'The first Codex run may prompt you to sign in with a ChatGPT account or API key.',
  installMethod: 'verified'
}

const CLAUDE_SETUP: CommandProfileSetupMetadata = {
  displayName: 'Claude Code',
  executableName: 'claude',
  shortDescription: 'Anthropic Claude Code terminal coding agent.',
  installHelpUrl: 'https://docs.anthropic.com/en/docs/claude-code/quickstart',
  installCommands: {
    windows: {
      command: 'irm https://claude.ai/install.ps1 | iex',
      source: 'Anthropic Claude Code official setup documentation',
      sourceUrl: 'https://docs.anthropic.com/en/docs/claude-code/quickstart',
      trust: 'verified'
    },
    linux: {
      command: 'curl -fsSL https://claude.ai/install.sh | bash',
      source: 'Anthropic Claude Code official setup documentation',
      sourceUrl: 'https://docs.anthropic.com/en/docs/claude-code/quickstart',
      trust: 'verified'
    },
    macos: {
      command: 'curl -fsSL https://claude.ai/install.sh | bash',
      source: 'Anthropic Claude Code official setup documentation',
      sourceUrl: 'https://docs.anthropic.com/en/docs/claude-code/quickstart',
      trust: 'verified'
    }
  },
  verificationCommand: 'claude --version',
  loginSetupNote: 'After installation, run claude and follow the provider login prompts in the terminal.',
  installMethod: 'verified'
}

const OPENCODE_SETUP: CommandProfileSetupMetadata = {
  displayName: 'OpenCode',
  executableName: 'opencode',
  shortDescription: 'OpenCode terminal coding agent.',
  installHelpUrl: 'https://opencode.ai/docs/',
  installCommands: {
    windows: {
      command: 'npm install -g opencode-ai',
      source: 'OpenCode official documentation',
      sourceUrl: 'https://opencode.ai/docs/',
      trust: 'verified'
    },
    linux: {
      command: 'npm install -g opencode-ai',
      source: 'OpenCode official documentation',
      sourceUrl: 'https://opencode.ai/docs/',
      trust: 'verified'
    },
    macos: {
      command: 'npm install -g opencode-ai',
      source: 'OpenCode official documentation',
      sourceUrl: 'https://opencode.ai/docs/',
      trust: 'verified'
    }
  },
  verificationCommand: 'opencode --version',
  loginSetupNote: 'If OpenCode needs provider auth or API keys, complete that inside the OpenCode terminal flow.',
  installMethod: 'verified'
}

const DROID_SETUP: CommandProfileSetupMetadata = {
  displayName: 'Factory Droid',
  executableName: 'droid',
  shortDescription: 'Factory Droid terminal coding agent.',
  installHelpUrl: 'https://docs.factory.ai/cli/getting-started/quickstart',
  installCommands: {
    windows: {
      command: 'irm https://app.factory.ai/cli/windows | iex',
      source: 'Factory Droid official documentation',
      sourceUrl: 'https://docs.factory.ai/cli/getting-started/quickstart',
      trust: 'verified'
    },
    linux: {
      command: 'curl -fsSL https://app.factory.ai/cli | sh',
      source: 'Factory Droid official documentation',
      sourceUrl: 'https://docs.factory.ai/cli/getting-started/quickstart',
      trust: 'verified'
    },
    macos: {
      command: 'curl -fsSL https://app.factory.ai/cli | sh',
      source: 'Factory Droid official documentation',
      sourceUrl: 'https://docs.factory.ai/cli/getting-started/quickstart',
      trust: 'verified'
    }
  },
  verificationCommand: 'droid --version',
  loginSetupNote: 'After installation, run droid in a project and follow the browser sign-in flow if prompted.',
  installMethod: 'verified'
}

const REASONIX_SETUP: CommandProfileSetupMetadata = {
  displayName: 'Reasonix',
  executableName: 'reasonix',
  shortDescription: 'DeepSeek-native terminal coding agent.',
  installHelpUrl: 'https://reasonix.io/docs/',
  installCommands: {
    windows: {
      command: 'npm install -g reasonix@next',
      source: 'Reasonix official documentation',
      sourceUrl: 'https://reasonix.io/docs/',
      trust: 'verified'
    },
    linux: {
      command: 'npm install -g reasonix@next',
      source: 'Reasonix official documentation',
      sourceUrl: 'https://reasonix.io/docs/',
      trust: 'verified'
    },
    macos: {
      command: 'npm install -g reasonix@next',
      source: 'Reasonix official documentation',
      sourceUrl: 'https://reasonix.io/docs/',
      trust: 'verified'
    }
  },
  verificationCommand: 'reasonix --version',
  loginSetupNote:
    'Reasonix can be started with npx reasonix code, but WindowPanes launches reasonix directly, so a global install is preferred for this profile. First run prompts for DeepSeek API setup.',
  installMethod: 'verified'
}

const PI_SETUP: CommandProfileSetupMetadata = {
  displayName: 'Pi',
  executableName: 'pi',
  shortDescription: 'Pi terminal coding harness.',
  installHelpUrl: 'https://pi.dev/docs/latest/quickstart',
  installCommands: {
    windows: {
      command: 'npm install -g --ignore-scripts @earendil-works/pi-coding-agent',
      source: 'Pi official quickstart documentation',
      sourceUrl: 'https://pi.dev/docs/latest/quickstart',
      trust: 'verified'
    },
    linux: {
      command: 'npm install -g --ignore-scripts @earendil-works/pi-coding-agent',
      source: 'Pi official quickstart documentation',
      sourceUrl: 'https://pi.dev/docs/latest/quickstart',
      trust: 'verified'
    },
    macos: {
      command: 'npm install -g --ignore-scripts @earendil-works/pi-coding-agent',
      source: 'Pi official quickstart documentation',
      sourceUrl: 'https://pi.dev/docs/latest/quickstart',
      trust: 'verified'
    }
  },
  verificationCommand: 'pi --version',
  loginSetupNote: 'After installation, run pi and use /login or configure provider API keys as described by Pi.',
  installMethod: 'verified'
}

const HERMES_SETUP: CommandProfileSetupMetadata = {
  displayName: 'Hermes Agent',
  executableName: 'hermes',
  shortDescription: 'Nous Research Hermes terminal agent.',
  installHelpUrl: 'https://hermes-agent.nousresearch.com/docs/getting-started/installation',
  installCommands: {
    windows: {
      command: 'iex (irm https://hermes-agent.nousresearch.com/install.ps1)',
      source: 'Hermes Agent official installation documentation',
      sourceUrl: 'https://hermes-agent.nousresearch.com/docs/getting-started/installation',
      trust: 'verified'
    },
    linux: {
      command: 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash',
      source: 'Hermes Agent official installation documentation',
      sourceUrl: 'https://hermes-agent.nousresearch.com/docs/getting-started/installation',
      trust: 'verified'
    },
    macos: {
      command: 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash',
      source: 'Hermes Agent official installation documentation',
      sourceUrl: 'https://hermes-agent.nousresearch.com/docs/getting-started/installation',
      trust: 'verified'
    }
  },
  verificationCommand: 'hermes --version',
  loginSetupNote: 'After installation, reload or open a new shell, then run hermes setup for provider configuration.',
  installMethod: 'verified'
}

const OPENCLAW_SETUP: CommandProfileSetupMetadata = {
  displayName: 'OpenClaw',
  executableName: 'openclaw',
  shortDescription: 'OpenClaw terminal agent and gateway.',
  installHelpUrl: 'https://docs.openclaw.ai/install',
  installCommands: {
    windows: {
      command: 'iwr -useb https://openclaw.ai/install.ps1 | iex',
      source: 'OpenClaw official installation documentation',
      sourceUrl: 'https://docs.openclaw.ai/install',
      trust: 'verified'
    },
    linux: {
      command: 'curl -fsSL https://openclaw.ai/install.sh | bash',
      source: 'OpenClaw official installation documentation',
      sourceUrl: 'https://docs.openclaw.ai/install',
      trust: 'verified'
    },
    macos: {
      command: 'curl -fsSL https://openclaw.ai/install.sh | bash',
      source: 'OpenClaw official installation documentation',
      sourceUrl: 'https://docs.openclaw.ai/install',
      trust: 'verified'
    }
  },
  verificationCommand: 'openclaw --version',
  loginSetupNote: 'The installer may launch onboarding. Complete OpenClaw setup in the visible terminal flow.',
  installMethod: 'verified'
}

/**
 * Built-in profiles. These only name a command on the user's PATH; the user
 * is responsible for installing/authenticating each CLI themselves. The host
 * launches them exactly as a shell would.
 */
export const BUILT_IN_PROFILES: readonly CommandProfile[] = [
  { id: 'builtin.claude', name: 'Claude Code', command: 'claude', args: [], builtIn: true, setup: CLAUDE_SETUP },
  { id: 'builtin.codex', name: 'Codex CLI', command: 'codex', args: [], builtIn: true, setup: CODEX_SETUP },
  {
    id: 'builtin.droid',
    name: 'Droid',
    command: 'droid',
    args: [],
    builtIn: true,
    setup: DROID_SETUP
  },
  { id: 'builtin.opencode', name: 'OpenCode', command: 'opencode', args: [], builtIn: true, setup: OPENCODE_SETUP },
  {
    id: 'builtin.reasonix',
    name: 'Reasonix',
    command: 'reasonix',
    args: [],
    builtIn: true,
    setup: REASONIX_SETUP
  },
  {
    id: 'builtin.pi',
    name: 'Pi',
    command: 'pi',
    args: [],
    builtIn: true,
    setup: PI_SETUP
  },
  {
    id: 'builtin.hermes',
    name: 'Hermes',
    command: 'hermes',
    args: [],
    builtIn: true,
    setup: HERMES_SETUP
  },
  {
    id: 'builtin.openclaw',
    name: 'OpenClaw',
    command: 'openclaw',
    args: [],
    builtIn: true,
    setup: OPENCLAW_SETUP
  },
  {
    id: 'builtin.shell',
    name: 'Generic Shell',
    // Resolved per-platform by the main process at spawn time (see ARCHITECTURE.md).
    command: '',
    args: [],
    builtIn: true
  }
] as const

export const GENERIC_SHELL_PROFILE_ID = 'builtin.shell'

export function normalizeCommandProfileForPlatform(
  profile: CommandProfile,
  platform: string
): CommandProfile {
  const builtInCommand = WINDOWS_BUILT_IN_AGENT_COMMANDS[profile.id]

  if (platform !== 'win32' || !profile.builtIn || !builtInCommand) {
    return {
      ...profile,
      args: [...profile.args],
      env: profile.env ? { ...profile.env } : undefined
    }
  }

  return {
    ...profile,
    command: WINDOWS_POWERSHELL_COMMAND,
    args: ['-NoLogo', '-NoExit', '-Command', builtInCommand],
    env: profile.env ? { ...profile.env } : undefined
  }
}
