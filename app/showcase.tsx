import { Redirect, useLocalSearchParams } from 'expo-router';

// Preserve existing shared links; initialization now belongs to the app root.
export default function ShowcaseScreen() {
  const { target } = useLocalSearchParams<{ target?: string }>();
  if (target === 'add') return <Redirect href="/add" />;
  if (target === 'archive') return <Redirect href="/archive" />;
  if (target === 'insights') return <Redirect href="/insights" />;
  if (target === 'collection') return <Redirect href="/collection" />;
  return <Redirect href="/" />;
}
