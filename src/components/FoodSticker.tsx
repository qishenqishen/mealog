import { Image, type ImageStyle, type StyleProp } from 'react-native';

/** The PNG contains its contour and white edge; never mask the original photo. */
export default function FoodSticker({ uri, size = 96, style, accessibilityLabel }: {
  uri: string; size?: number; style?: StyleProp<ImageStyle>; accessibilityLabel?: string;
}) {
  return <Image source={{ uri }} resizeMode="contain" accessibilityLabel={accessibilityLabel}
    style={[{ width: size, height: size }, style]} />;
}
