import * as Location from 'expo-location';

import type { MealLocation } from '../types';
import { getPermissionStatus } from './permissions';

export function buildMealEatenAt(dateKey: string, timeKey: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^\d{2}:\d{2}$/.test(timeKey)) {
    return undefined;
  }

  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = timeKey.split(':').map(Number);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function formatAddress(address: Location.LocationGeocodedAddress): string | undefined {
  const parts = [
    address.name,
    address.street,
    address.city,
    address.region,
    address.country,
  ].filter(Boolean);
  return parts.length > 0 ? [...new Set(parts)].join(', ') : undefined;
}

export function formatMealLocation(location: MealLocation): string {
  if (location.label?.trim()) return location.label.trim();
  if (location.address?.trim()) return location.address.trim();
  if (typeof location.latitude === 'number' && typeof location.longitude === 'number') {
    return `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
  }
  return '';
}

export async function getCurrentMealLocation(): Promise<MealLocation> {
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  let address: string | undefined;
  try {
    const [result] = await Location.reverseGeocodeAsync(position.coords);
    address = result ? formatAddress(result) : undefined;
  } catch {
    address = undefined;
  }

  return {
    source: 'gps',
    label: address,
    address,
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    capturedAt: new Date().toISOString(),
  };
}

export async function getCurrentMealLocationIfAllowed(): Promise<MealLocation | undefined> {
  const permission = await getPermissionStatus('location');
  if (!permission.granted) return undefined;
  return getCurrentMealLocation();
}

export function buildManualMealLocation(label: string): MealLocation | undefined {
  const trimmed = label.trim();
  if (!trimmed) return undefined;
  return {
    source: 'manual',
    label: trimmed,
    address: trimmed,
    capturedAt: new Date().toISOString(),
  };
}
