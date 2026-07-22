import { contextBridge, ipcRenderer } from 'electron';
import {
  IpcChannel,
  type DetachedWindowCloseRequest,
  type DetachedWindowClosedEvent,
  type DetachedWindowReadyRequest,
  type DetachedWindowResizeRequest,
  type CommandAvailabilityRequest,
  type DetachedWindowUpdateRequest,
  type DetachPaneRequest,
  type KillRequest,
  type PersistedState,
  type ReplayDataRequest,
  type ResizeRequest,
  type RestartRequest,
  type SetupSpawnRequest,
  type SpawnRequest,
  type TerminalApi,
  type TerminalDataEvent,
  type TerminalExitEvent,
  type WriteRequest,
  type StorageApi
} from '../shared';

const terminalApi: TerminalApi = {
  spawn: (request: SpawnRequest) => ipcRenderer.invoke(IpcChannel.TerminalSpawn, request),
  spawnSetup: (request: SetupSpawnRequest) => ipcRenderer.invoke(IpcChannel.TerminalSpawnSetup, request),
  checkCommand: (request: CommandAvailabilityRequest) =>
    ipcRenderer.invoke(IpcChannel.TerminalCheckCommand, request),
  write: (request: WriteRequest) => {
    void ipcRenderer.invoke(IpcChannel.TerminalWrite, request);
  },
  resize: (request: ResizeRequest) => {
    void ipcRenderer.invoke(IpcChannel.TerminalResize, request);
  },
  kill: (request: KillRequest) => {
    void ipcRenderer.invoke(IpcChannel.TerminalKill, request);
  },
  restart: (request: RestartRequest) => ipcRenderer.invoke(IpcChannel.TerminalRestart, request),
  replayData: (request: ReplayDataRequest) => ipcRenderer.invoke(IpcChannel.TerminalReplayData, request),
  detachPane: (request: DetachPaneRequest) => ipcRenderer.invoke(IpcChannel.TerminalDetachPane, request),
  notifyDetachedWindowReady: (request: DetachedWindowReadyRequest) =>
    ipcRenderer.invoke(IpcChannel.DetachedWindowReady, request),
  updateDetachedWindow: (request: DetachedWindowUpdateRequest) =>
    ipcRenderer.invoke(IpcChannel.DetachedWindowUpdate, request),
  resizeDetachedWindow: (request: DetachedWindowResizeRequest) =>
    ipcRenderer.invoke(IpcChannel.DetachedWindowResize, request),
  closeDetachedWindow: (request: DetachedWindowCloseRequest) =>
    ipcRenderer.invoke(IpcChannel.DetachedWindowClose, request),
  onData: (callback: (event: TerminalDataEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: TerminalDataEvent): void => {
      callback(payload);
    };

    ipcRenderer.on(IpcChannel.TerminalData, listener);
    return () => ipcRenderer.off(IpcChannel.TerminalData, listener);
  },
  onExit: (callback: (event: TerminalExitEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: TerminalExitEvent): void => {
      callback(payload);
    };

    ipcRenderer.on(IpcChannel.TerminalExit, listener);
    return () => ipcRenderer.off(IpcChannel.TerminalExit, listener);
  },
  onDetachedWindowClosed: (callback: (event: DetachedWindowClosedEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: DetachedWindowClosedEvent): void => {
      callback(payload);
    };

    ipcRenderer.on(IpcChannel.DetachedWindowClosed, listener);
    return () => ipcRenderer.off(IpcChannel.DetachedWindowClosed, listener);
  }
};

const storageApi: StorageApi = {
  load: () => ipcRenderer.invoke(IpcChannel.StorageLoad),
  save: (state: PersistedState) => ipcRenderer.invoke(IpcChannel.StorageSave, state)
};

contextBridge.exposeInMainWorld('terminalApi', terminalApi);
contextBridge.exposeInMainWorld('storageApi', storageApi);
