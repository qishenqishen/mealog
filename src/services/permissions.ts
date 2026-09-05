import { Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

export type PermissionKind = 'photos' | 'camera' | 'location';
export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'limited';

export interface PermissionResult {
  kind: PermissionKind;
  status: PermissionState;
  granted: boolean;
  canAskAgain?: boolean;
  message?: string;
}

function normalizeMediaPermission(
  kind: 'photos' | 'camera',
  response: ImagePicker.MediaLibraryPermissionResponse | ImagePicker.CameraPermissionResponse,
): PermissionResult {
  const maybeLimited = 'accessPrivileges' in response && response.accessPrivileges === 'limited';
  return {
    kind,
    status: maybeLimited ? 'limited' : response.granted ? 'granted' : response.status,
    granted: response.granted || maybeLimited,
    canAskAgain: response.canAskAgain,
    message: response.granted || maybeLimited
      ? undefined
      : kind === 'photos'
        ? 'Photo access is used only when you choose a picture for a Mealog memory.'
        : 'Camera access is used only when you choose to take a picture for Mealog.',
  };
}

function normalizeLocationPermission(
  response: Location.LocationPermissionResponse,
): PermissionResult {
  return {
    kind: 'location',
    status: response.granted ? 'granted' : response.status,
    granted: response.granted,
    canAskAgain: response.canAskAgain,
    message: response.granted
      ? undefined
      : 'Location is optional and is used only when you choose to remember where a meal happened.',
  };
}

export async function getPermissionStatus(kind: PermissionKind): Promise<PermissionResult> {
  if (kind === 'photos') {
    return normalizeMediaPermission(kind, await ImagePicker.getMediaLibraryPermissionsAsync());
  }
  if (kind === 'camera') {
    return normalizeMediaPermission(kind, await ImagePicker.getCameraPermissionsAsync());
  }
  return normalizeLocationPermission(await Location.getForegroundPermissionsAsync());
}

export async function requestPhotosPermission(): Promise<PermissionResult> {
  return normalizeMediaPermission('photos', await ImagePicker.requestMediaLibraryPermissionsAsync());
}

export async function requestCameraPermission(): Promise<PermissionResult> {
  return normalizeMediaPermission('camera', await ImagePicker.requestCameraPermissionsAsync());
}

export async function requestLocationPermission(): Promise<PermissionResult> {
  return normalizeLocationPermission(await Location.requestForegroundPermissionsAsync());
}

export async function requestPermission(kind: PermissionKind): Promise<PermissionResult> {
  if (kind === 'photos') return requestPhotosPermission();
  if (kind === 'camera') return requestCameraPermission();
  return requestLocationPermission();
}

export async function openPermissionSettings(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Linking.openSettings();
}
