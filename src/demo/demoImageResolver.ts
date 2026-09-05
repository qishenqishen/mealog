import {
  Image,
  PixelRatio,
  Platform,
  type ImageResolvedAssetSource,
  type ImageSourcePropType,
} from 'react-native';

export type DemoImageAsset = ImageSourcePropType | string | { uri?: string };

type WebPackagerAsset = {
  httpServerLocation: string;
  name: string;
  type: string;
  scales?: number[];
};

type WebAssetRegistry = {
  getAssetByID?: (assetId: number) => WebPackagerAsset | undefined;
};

function pickWebAssetScale(scales?: number[]): number {
  if (!scales?.length) return 1;
  const preferredScale = PixelRatio.get();
  return scales.reduce((closest, scale) =>
    Math.abs(scale - preferredScale) < Math.abs(closest - preferredScale) ? scale : closest,
  );
}

function resolveWebAssetUri(assetId: number): string | undefined {
  if (Platform.OS !== 'web') return undefined;

  try {
    const registry = require('react-native-web/dist/modules/AssetRegistry') as WebAssetRegistry;
    const asset = registry.getAssetByID?.(assetId);
    if (!asset) return undefined;

    const scale = pickWebAssetScale(asset.scales);
    const scaleSuffix = scale !== 1 ? `@${scale}x` : '';
    return `${asset.httpServerLocation}/${asset.name}${scaleSuffix}.${asset.type}`;
  } catch {
    return undefined;
  }
}

export function resolveDemoImageAssetUri(asset: DemoImageAsset): string | undefined {
  if (typeof asset === 'string') return asset;

  if (Array.isArray(asset)) {
    for (const source of asset) {
      const uri = resolveDemoImageAssetUri(source);
      if (uri) return uri;
    }
    return undefined;
  }

  if (asset && typeof asset === 'object' && typeof asset.uri === 'string') {
    return asset.uri;
  }

  const resolveAssetSource = Image.resolveAssetSource as
    | ((source: ImageSourcePropType) => ImageResolvedAssetSource | undefined)
    | undefined;
  const resolved = resolveAssetSource?.(asset);
  if (resolved?.uri) return resolved.uri;

  if (typeof asset === 'number') {
    return resolveWebAssetUri(asset);
  }

  return undefined;
}
