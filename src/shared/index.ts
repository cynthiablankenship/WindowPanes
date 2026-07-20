/**
 * Shared contract barrel. Both main/preload (tom) and renderer (bob) import
 * from '@shared' / relative '../shared'. This is the single source of truth
 * for IPC channels and domain types — do not redefine these elsewhere.
 */
export * from './profiles'
export * from './commandAvailability'
export * from './themes'
export * from './layout'
export * from './storage'
export * from './ipc'
export * from './detachedPaneConfig'
