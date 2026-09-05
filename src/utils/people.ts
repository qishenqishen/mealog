import type { MealCompanion, PersonProfile } from '../types';

export function getPersonInitials(name?: string): string {
  const trimmed = name?.trim();
  if (!trimmed) return '?';

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function getPersonDisplayName(
  person?: PersonProfile,
  companion?: MealCompanion,
): string {
  if (person?.deletedAt) {
    return companion?.personNameSnapshot ?? 'Deleted person';
  }
  return person?.nickname ?? person?.name ?? companion?.personNameSnapshot ?? 'Deleted person';
}

export function formatSharedWith(names: string[]): string | undefined {
  const cleanNames = names.map((name) => name.trim()).filter(Boolean);
  if (cleanNames.length === 0) return undefined;
  if (cleanNames.length === 1) return `Shared with ${cleanNames[0]}`;
  if (cleanNames.length === 2) return `Shared with ${cleanNames[0]} and ${cleanNames[1]}`;
  return `Shared with ${cleanNames[0]}, ${cleanNames[1]}, and ${cleanNames.length - 2} others`;
}
