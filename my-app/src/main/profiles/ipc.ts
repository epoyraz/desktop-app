/**
 * profiles/ipc.ts — IPC handlers for the profile picker and settings profile tab.
 *
 * Registers all profiles: channels via ipcMain.handle.
 * Call registerProfileHandlers() once after app.whenReady().
 * Call unregisterProfileHandlers() on will-quit.
 */

import { ipcMain } from 'electron';
import { mainLogger } from '../logger';
import type { ProfileStore, Profile } from './ProfileStore';
import { PROFILE_COLORS } from './ProfileStore';
import { closeProfilePickerWindow } from './ProfilePickerWindow';
import { assertString } from '../ipc-validators';

// ---------------------------------------------------------------------------
// IPC channels
// ---------------------------------------------------------------------------

const CH_GET_PROFILES          = 'profiles:get-all';
const CH_ADD_PROFILE           = 'profiles:add';
const CH_REMOVE_PROFILE        = 'profiles:remove';
const CH_SELECT_PROFILE        = 'profiles:select';
const CH_BROWSE_AS_GUEST       = 'profiles:browse-as-guest';
const CH_GET_SHOW_PICKER       = 'profiles:get-show-picker';
const CH_SET_SHOW_PICKER       = 'profiles:set-show-picker';
const CH_GET_PROFILE_COLORS    = 'profiles:get-colors';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let _profileStore: ProfileStore | null = null;
let _onProfileSelected: ((profileId: string | null) => void) | null = null;

// ---------------------------------------------------------------------------
// Handler implementations
// ---------------------------------------------------------------------------

function handleGetProfiles(): { profiles: Profile[]; lastSelectedId: string | null } {
  mainLogger.info(CH_GET_PROFILES);
  if (!_profileStore) throw new Error('ProfileStore not initialised');
  const profiles = _profileStore.getProfiles();
  const lastSelectedId = _profileStore.getLastSelectedProfileId();
  mainLogger.info(`${CH_GET_PROFILES}.ok`, { count: profiles.length, lastSelectedId });
  return { profiles, lastSelectedId };
}

function handleAddProfile(
  _event: Electron.IpcMainInvokeEvent,
  payload: { name: string; color: string },
): Profile {
  mainLogger.info(CH_ADD_PROFILE, { name: payload?.name, color: payload?.color });
  if (!_profileStore) throw new Error('ProfileStore not initialised');
  const name = assertString(payload?.name, 'name', 40);
  const color = assertString(payload?.color, 'color', 20);
  const profile = _profileStore.addProfile(name, color);
  mainLogger.info(`${CH_ADD_PROFILE}.ok`, { id: profile.id, name: profile.name });
  return profile;
}

function handleRemoveProfile(
  _event: Electron.IpcMainInvokeEvent,
  payload: { id: string },
): boolean {
  mainLogger.info(CH_REMOVE_PROFILE, { id: payload?.id });
  if (!_profileStore) throw new Error('ProfileStore not initialised');
  const id = assertString(payload?.id, 'id', 100);
  const removed = _profileStore.removeProfile(id);
  mainLogger.info(`${CH_REMOVE_PROFILE}.ok`, { id, removed });
  return removed;
}

function handleSelectProfile(
  _event: Electron.IpcMainInvokeEvent,
  payload: { id: string },
): void {
  mainLogger.info(CH_SELECT_PROFILE, { id: payload?.id });
  if (!_profileStore) throw new Error('ProfileStore not initialised');
  const id = assertString(payload?.id, 'id', 100);
  _profileStore.setLastSelectedProfileId(id);
  closeProfilePickerWindow();
  _onProfileSelected?.(id);
  mainLogger.info(`${CH_SELECT_PROFILE}.ok`, { id });
}

function handleBrowseAsGuest(): void {
  mainLogger.info(CH_BROWSE_AS_GUEST);
  closeProfilePickerWindow();
  _onProfileSelected?.(null);
  mainLogger.info(`${CH_BROWSE_AS_GUEST}.ok`);
}

function handleGetShowPicker(): boolean {
  mainLogger.info(CH_GET_SHOW_PICKER);
  if (!_profileStore) return false;
  const show = _profileStore.getShowPickerOnLaunch();
  mainLogger.info(`${CH_GET_SHOW_PICKER}.ok`, { show });
  return show;
}

function handleSetShowPicker(
  _event: Electron.IpcMainInvokeEvent,
  show: boolean,
): void {
  mainLogger.info(CH_SET_SHOW_PICKER, { show });
  if (!_profileStore) throw new Error('ProfileStore not initialised');
  _profileStore.setShowPickerOnLaunch(!!show);
  mainLogger.info(`${CH_SET_SHOW_PICKER}.ok`, { show: !!show });
}

function handleGetProfileColors(): readonly string[] {
  return PROFILE_COLORS;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RegisterProfileHandlersOptions {
  profileStore: ProfileStore;
  onProfileSelected: (profileId: string | null) => void;
}

export function registerProfileHandlers(opts: RegisterProfileHandlersOptions): void {
  mainLogger.info('profiles.ipc.register');

  _profileStore = opts.profileStore;
  _onProfileSelected = opts.onProfileSelected;

  ipcMain.handle(CH_GET_PROFILES,       handleGetProfiles);
  ipcMain.handle(CH_ADD_PROFILE,        handleAddProfile);
  ipcMain.handle(CH_REMOVE_PROFILE,     handleRemoveProfile);
  ipcMain.handle(CH_SELECT_PROFILE,     handleSelectProfile);
  ipcMain.handle(CH_BROWSE_AS_GUEST,    handleBrowseAsGuest);
  ipcMain.handle(CH_GET_SHOW_PICKER,    handleGetShowPicker);
  ipcMain.handle(CH_SET_SHOW_PICKER,    handleSetShowPicker);
  ipcMain.handle(CH_GET_PROFILE_COLORS, handleGetProfileColors);

  mainLogger.info('profiles.ipc.register.ok', { channelCount: 8 });
}

export function unregisterProfileHandlers(): void {
  mainLogger.info('profiles.ipc.unregister');

  ipcMain.removeHandler(CH_GET_PROFILES);
  ipcMain.removeHandler(CH_ADD_PROFILE);
  ipcMain.removeHandler(CH_REMOVE_PROFILE);
  ipcMain.removeHandler(CH_SELECT_PROFILE);
  ipcMain.removeHandler(CH_BROWSE_AS_GUEST);
  ipcMain.removeHandler(CH_GET_SHOW_PICKER);
  ipcMain.removeHandler(CH_SET_SHOW_PICKER);
  ipcMain.removeHandler(CH_GET_PROFILE_COLORS);

  _profileStore = null;
  _onProfileSelected = null;

  mainLogger.info('profiles.ipc.unregister.ok');
}
