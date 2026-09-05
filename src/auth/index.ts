import AsyncStorage from '@react-native-async-storage/async-storage';

import { generateId } from '../utils/id';

const USER_IDENTITY_KEY = '@mealogue/userIdentity';

export const AUTH_BACKEND_AVAILABLE = false;

export type UserIdentityMode = 'guest' | 'local_profile';

export interface UserIdentity {
  id: string;
  mode: UserIdentityMode;
  displayName: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

type StoredUserIdentity = Partial<UserIdentity>;

function normalizeIdentity(value: StoredUserIdentity | null): UserIdentity | null {
  if (!value?.id) return null;
  const now = new Date().toISOString();
  return {
    id: value.id,
    mode: value.mode === 'local_profile' ? 'local_profile' : 'guest',
    displayName: value.displayName?.trim() || 'Guest at the table',
    note: value.note?.trim() || undefined,
    createdAt: value.createdAt ?? now,
    updatedAt: value.updatedAt ?? value.createdAt ?? now,
  };
}

export async function getUserIdentity(): Promise<UserIdentity | null> {
  const raw = await AsyncStorage.getItem(USER_IDENTITY_KEY);
  if (!raw) return null;

  try {
    return normalizeIdentity(JSON.parse(raw) as StoredUserIdentity);
  } catch {
    return null;
  }
}

export async function saveUserIdentity(identity: UserIdentity): Promise<UserIdentity> {
  const normalized = normalizeIdentity(identity);
  if (!normalized) throw new Error('A local identity could not be saved.');
  await AsyncStorage.setItem(USER_IDENTITY_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function ensureGuestIdentity(): Promise<UserIdentity> {
  const existing = await getUserIdentity();
  if (existing) return existing;

  const now = new Date().toISOString();
  return saveUserIdentity({
    id: generateId(),
    mode: 'guest',
    displayName: 'Guest at the table',
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateLocalProfile(input: {
  displayName: string;
  note?: string;
}): Promise<UserIdentity> {
  const existing = await ensureGuestIdentity();
  const now = new Date().toISOString();
  return saveUserIdentity({
    ...existing,
    mode: 'local_profile',
    displayName: input.displayName.trim() || 'Guest at the table',
    note: input.note?.trim() || undefined,
    updatedAt: now,
  });
}

export async function getCurrentUserId(): Promise<string> {
  const identity = await ensureGuestIdentity();
  return identity.id;
}

export async function requestAuthIntent(
  action: 'sign_in' | 'create_account',
): Promise<{ available: false; message: string }> {
  const label = action === 'sign_in' ? 'Sign in' : 'Create account';
  return {
    available: false,
    message: `${label} is not connected yet. Mealog is currently local-only, so you can continue as guest and keep meals on this device.`,
  };
}
