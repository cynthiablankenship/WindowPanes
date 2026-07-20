import { app, BrowserWindow, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import * as pty from 'node-pty';
import {
  DEFAULT_PERSISTED_STATE,
  IpcChannel,
  WINDOWS_POWERSHELL_COMMAND,
  checkCommandProfileAvailability,
  getInstallCommandForPlatform,
  isSetupManagedBuiltInProfile,
  type CommandAvailabilityRequest,
  type KillRequest,
  type PersistedState,
  type ReplayDataRequest,
  type ResizeRequest,
  type RestartRequest,
  type SetupSpawnRequest,
  type SpawnRequest,
  type SpawnResult,
  type TerminalDataEvent,
  type TerminalExitEvent,
  type WriteRequest,
  normalizeCommandProfileForPlatform
} from '../shared';
import type { CommandProfile } from '../shared';

interface PtyRecord {
  ptyId: string;
  paneId: string;
  profile: CommandProfile;
  cols: number;
  rows: number;
  process: pty.IPty;
  nextSeq: number;
  outputBuffer: TerminalDataEvent[];
}

interface ResolvedCommand {
  profileName: string;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  resolvedExecutable: string | null;
  platform: NodeJS.Platform;
}

const ptys = new Map<string, PtyRecord>();
const PTY_REPLAY_BUFFER_LIMIT = 200;
const APP_NAME = 'WindowPanes';
const LEGACY_USER_DATA_DIRNAME = 'ai-terminal-workspace';
const WINDOWS_APP_USER_MODEL_ID = 'com.windowpanes.app';
const ICON_FILENAMES = process.platform === 'win32' ? ['icon.ico', 'icon.png'] : ['icon.png', 'icon.ico'];

function resolveAppIconPath(): string | undefined {
  const assetRoots = [
    join(app.getAppPath(), 'assets'),
    join(__dirname, '../../assets')
  ];

  for (const assetRoot of assetRoots) {
    for (const iconFilename of ICON_FILENAMES) {
      const iconPath = join(assetRoot, iconFilename);

      if (existsSync(iconPath)) {
        return iconPath;
      }
    }
  }

  return undefined;
}

function preserveUserDataPath(): void {
  app.setPath('userData', join(app.getPath('appData'), LEGACY_USER_DATA_DIRNAME));
}

function createWindow(): void {
  const appIconPath = resolveAppIconPath();
  const rendererEntry = process.env.WINDOWPANES_RENDERER === 'gemstone' ? 'gemstone' : 'index';
  const mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: '#111317',
    ...(appIconPath ? { icon: appIconPath } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    const rendererUrl =
      rendererEntry === 'gemstone'
        ? new URL('gemstone.html', ensureTrailingSlash(process.env.ELECTRON_RENDERER_URL)).toString()
        : process.env.ELECTRON_RENDERER_URL;

    void mainWindow.loadURL(rendererUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, `../renderer/${rendererEntry}.html`));
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function normalizedEnv(profileEnv?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }

  return {
    ...env,
    ...profileEnv
  };
}

function resolveShellCommand(): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    return {
      command: process.env.COMSPEC || 'cmd.exe',
      args: []
    };
  }

  return {
    command: process.env.SHELL || '/bin/sh',
    args: []
  };
}

function resolveCommand(profile: CommandProfile): ResolvedCommand {
  const base =
    profile.id === 'builtin.shell' && profile.command.trim() === ''
      ? resolveShellCommand()
      : { command: profile.command, args: profile.args };
  const command = base.command.trim();
  const env = normalizedEnv(profile.env);

  if (command.length === 0) {
    throw new Error(`Command not found: ${profile.name}`);
  }

  return {
    profileName: profile.name,
    command,
    args: [...base.args],
    cwd: profile.cwd || app.getPath('home'),
    env,
    resolvedExecutable: resolveExecutable(command, env),
    platform: process.platform
  };
}

function emitData(browserWindow: BrowserWindow, event: TerminalDataEvent): void {
  if (browserWindow.isDestroyed() || browserWindow.webContents.isDestroyed()) {
    return;
  }

  browserWindow.webContents.send(IpcChannel.TerminalData, event);
}

function emitExit(browserWindow: BrowserWindow, event: TerminalExitEvent): void {
  if (browserWindow.isDestroyed() || browserWindow.webContents.isDestroyed()) {
    return;
  }

  browserWindow.webContents.send(IpcChannel.TerminalExit, event);
}

function spawnPty(browserWindow: BrowserWindow, request: SpawnRequest): SpawnResult {
  const profile = normalizeCommandProfileForPlatform(request.profile, process.platform);
  const resolved = resolveCommand(profile);
  const ptyId = randomUUID();

  try {
    const cols = Math.max(1, request.cols);
    const rows = Math.max(1, request.rows);
    const child = pty.spawn(resolved.command, resolved.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: resolved.cwd,
      env: resolved.env
    });

    const record: PtyRecord = {
      ptyId,
      paneId: request.paneId,
      profile,
      cols,
      rows,
      process: child,
      nextSeq: 1,
      outputBuffer: []
    };

    ptys.set(ptyId, record);

    child.onData((data) => {
      const event = { ptyId, seq: record.nextSeq, data };
      record.nextSeq += 1;
      record.outputBuffer.push(event);

      if (record.outputBuffer.length > PTY_REPLAY_BUFFER_LIMIT) {
        record.outputBuffer.splice(0, record.outputBuffer.length - PTY_REPLAY_BUFFER_LIMIT);
      }

      emitData(browserWindow, event);
    });

    child.onExit(({ exitCode, signal }) => {
      ptys.delete(ptyId);
      emitExit(browserWindow, {
        ptyId,
        exitCode,
        signal: typeof signal === 'number' ? signal : null
      });
    });

    return {
      ptyId,
      paneId: request.paneId
    };
  } catch (error) {
    throw new Error(formatLaunchFailure(resolved, error));
  }
}

function spawnSetupPty(browserWindow: BrowserWindow, request: SetupSpawnRequest): SpawnResult {
  if (!isSetupManagedBuiltInProfile(request.profile)) {
    throw new Error('Setup commands are only available for built-in profiles with setup metadata.');
  }

  const installCommand = getInstallCommandForPlatform(request.profile, process.platform);

  if (!installCommand || installCommand.trust !== 'verified') {
    throw new Error('No verified setup command is configured for this profile on this operating system.');
  }

  return spawnPty(browserWindow, {
    ...request,
    profile: createSetupCommandProfile(request.profile, installCommand.command)
  });
}

function createSetupCommandProfile(profile: CommandProfile, installCommand: string): CommandProfile {
  if (process.platform === 'win32') {
    return {
      id: `${profile.id}.setup`,
      name: `${profile.name} setup`,
      command: WINDOWS_POWERSHELL_COMMAND,
      args: [
        '-NoLogo',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        createWindowsSetupCommand(profile, installCommand)
      ],
      builtIn: false
    };
  }

  return {
    id: `${profile.id}.setup`,
    name: `${profile.name} setup`,
    command: process.env.SHELL || '/bin/sh',
    args: ['-lc', createPosixSetupCommand(profile, installCommand)],
    builtIn: false
  };
}

function createWindowsSetupCommand(profile: CommandProfile, installCommand: string): string {
  return [
    `Write-Host ${quotePowerShellString(`WindowPanes setup for ${profile.name}`)}`,
    `Write-Host ${quotePowerShellString(`Running: ${installCommand}`)}`,
    installCommand,
    '$windowPanesExitCode = if ($LASTEXITCODE -is [int]) { $LASTEXITCODE } else { 0 }',
    'Write-Host ""',
    'Write-Host "Setup command finished with exit code $windowPanesExitCode."',
    'Read-Host "Press Enter to let WindowPanes re-check PATH"',
    'exit $windowPanesExitCode'
  ].join('; ');
}

function createPosixSetupCommand(profile: CommandProfile, installCommand: string): string {
  return [
    `printf '%s\\n' ${quotePosixString(`WindowPanes setup for ${profile.name}`)}`,
    `printf '%s\\n' ${quotePosixString(`Running: ${installCommand}`)}`,
    installCommand,
    'windowpanes_exit_code=$?',
    'printf "\\nSetup command finished with exit code %s.\\n" "$windowpanes_exit_code"',
    `printf '%s' ${quotePosixString('Press Enter to let WindowPanes re-check PATH')}`,
    'IFS= read -r _windowpanes_continue',
    'exit "$windowpanes_exit_code"'
  ].join('\n');
}

function quotePowerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function quotePosixString(value: string): string {
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

function checkCommandAvailability(request: CommandAvailabilityRequest) {
  return checkCommandProfileAvailability(request.profile, process.platform, (executableName, profile) =>
    resolveExecutable(executableName, normalizedEnv(profile.env))
  );
}

function resolveExecutable(command: string, env: Record<string, string>): string | null {
  const candidates = createExecutableCandidates(command, env);

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function createExecutableCandidates(command: string, env: Record<string, string>): string[] {
  if (isAbsolute(command) || command.includes('/') || command.includes('\\')) {
    return expandWindowsExecutableExtensions(command, env);
  }

  return getPathEntries(env).flatMap((pathEntry) =>
    expandWindowsExecutableExtensions(resolve(pathEntry, command), env)
  );
}

function expandWindowsExecutableExtensions(command: string, env: Record<string, string>): string[] {
  if (process.platform !== 'win32' || extname(command)) {
    return [command];
  }

  return [command, ...getPathExtEntries(env).map((extension) => `${command}${extension}`)];
}

function getPathEntries(env: Record<string, string>): string[] {
  const pathValue = getEnvironmentValue(env, 'PATH');

  return pathValue ? pathValue.split(delimiter).filter(Boolean) : [];
}

function getPathExtEntries(env: Record<string, string>): string[] {
  const pathExtValue = getEnvironmentValue(env, 'PATHEXT') || '.COM;.EXE;.BAT;.CMD';

  return pathExtValue
    .split(';')
    .map((extension) => extension.trim())
    .filter(Boolean);
}

function getEnvironmentValue(env: Record<string, string>, name: string): string | undefined {
  const exactValue = env[name];

  if (typeof exactValue === 'string') {
    return exactValue;
  }

  const matchingKey = Object.keys(env).find((key) => key.toLowerCase() === name.toLowerCase());

  return matchingKey ? env[matchingKey] : undefined;
}

function formatLaunchFailure(resolved: ResolvedCommand, error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const rawCode = getLaunchErrorCode(error);

  return [
    'Command not found or failed to start.',
    `Profile: ${resolved.profileName}`,
    `Attempted command: ${resolved.command}`,
    `Args: ${resolved.args.length > 0 ? resolved.args.join(' ') : '(none)'}`,
    `Cwd: ${resolved.cwd}`,
    `Platform: ${resolved.platform}`,
    `Effective PATH: ${getEnvironmentValue(resolved.env, 'PATH') || '(empty)'}`,
    `Resolved executable: ${resolved.resolvedExecutable ?? '(not found)'}`,
    `Raw error message: ${rawMessage}`,
    `Raw error code: ${rawCode ?? '(none)'}`
  ].join('\n');
}

function getLaunchErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const candidate = error as { code?: unknown; errno?: unknown };
  const code = candidate.code ?? candidate.errno;

  return typeof code === 'string' || typeof code === 'number' ? String(code) : undefined;
}

function windowFromSender(sender: Electron.WebContents): BrowserWindow {
  const browserWindow = BrowserWindow.fromWebContents(sender);

  if (!browserWindow) {
    throw new Error('Terminal request did not come from an application window.');
  }

  return browserWindow;
}

function killPty(ptyId: string): void {
  const record = ptys.get(ptyId);

  if (!record) {
    return;
  }

  ptys.delete(ptyId);
  record.process.kill();
}

function storagePath(): string {
  return join(app.getPath('userData'), 'state.json');
}

function loadState(): PersistedState {
  const path = storagePath();

  if (!existsSync(path)) {
    return DEFAULT_PERSISTED_STATE;
  }

  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as PersistedState;

    return {
      ...DEFAULT_PERSISTED_STATE,
      ...parsed,
      preferences: {
        ...DEFAULT_PERSISTED_STATE.preferences,
        ...parsed.preferences
      }
    };
  } catch {
    // Corrupt/unreadable state.json: fall back to defaults per storage contract.
    return DEFAULT_PERSISTED_STATE;
  }
}

function saveState(state: PersistedState): void {
  const path = storagePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2), 'utf8');
}

function registerIpc(): void {
  ipcMain.handle(IpcChannel.TerminalSpawn, (event, request: SpawnRequest) => {
    return spawnPty(windowFromSender(event.sender), request);
  });

  ipcMain.handle(IpcChannel.TerminalSpawnSetup, (event, request: SetupSpawnRequest) => {
    return spawnSetupPty(windowFromSender(event.sender), request);
  });

  ipcMain.handle(IpcChannel.TerminalCheckCommand, (_event, request: CommandAvailabilityRequest) => {
    return checkCommandAvailability(request);
  });

  ipcMain.handle(IpcChannel.TerminalWrite, (_event, request: WriteRequest) => {
    ptys.get(request.ptyId)?.process.write(request.data);
  });

  ipcMain.handle(IpcChannel.TerminalResize, (_event, request: ResizeRequest) => {
    const record = ptys.get(request.ptyId);

    if (!record) {
      return;
    }

    const cols = Math.max(1, request.cols);
    const rows = Math.max(1, request.rows);

    if (record.cols === cols && record.rows === rows) {
      return;
    }

    record.cols = cols;
    record.rows = rows;
    record.process.resize(cols, rows);
  });

  ipcMain.handle(IpcChannel.TerminalKill, (_event, request: KillRequest) => {
    killPty(request.ptyId);
  });

  ipcMain.handle(IpcChannel.TerminalReplayData, (_event, request: ReplayDataRequest) => {
    return [...(ptys.get(request.ptyId)?.outputBuffer ?? [])];
  });

  ipcMain.handle(IpcChannel.TerminalRestart, (event, request: RestartRequest) => {
    const existing = ptys.get(request.ptyId);

    if (!existing) {
      throw new Error('Cannot restart terminal: process is no longer running.');
    }

    const spawnRequest: SpawnRequest = {
      paneId: existing.paneId,
      profile: request.profile,
      cols: existing.cols,
      rows: existing.rows
    };

    killPty(request.ptyId);
    return spawnPty(windowFromSender(event.sender), spawnRequest);
  });

  ipcMain.handle(IpcChannel.StorageLoad, () => loadState());
  ipcMain.handle(IpcChannel.StorageSave, (_event, state: PersistedState) => saveState(state));
}

app.whenReady().then(() => {
  app.setName(APP_NAME);
  preserveUserDataPath();

  if (process.platform === 'win32') {
    app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);
  }

  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  for (const ptyId of [...ptys.keys()]) {
    killPty(ptyId);
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});
