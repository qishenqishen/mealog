export type SlowMailStationery = {
  envelope: 'oat' | 'sage' | 'clay';
  paper: 'ivory' | 'cream' | 'sage';
  stamp: 'coffee' | 'bread' | 'flower';
};

export const DEFAULT_SLOW_MAIL_STATIONERY: Readonly<SlowMailStationery> = {
  envelope: 'oat', paper: 'ivory', stamp: 'coffee',
};

export function parseSlowMailStationery(value: unknown): SlowMailStationery | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const { envelope, paper, stamp } = value as Record<string, unknown>;
  if (Object.keys(value).length !== 3
    || !Object.hasOwn(value, 'envelope') || !Object.hasOwn(value, 'paper') || !Object.hasOwn(value, 'stamp')
    || (envelope !== 'oat' && envelope !== 'sage' && envelope !== 'clay')
    || (paper !== 'ivory' && paper !== 'cream' && paper !== 'sage')
    || (stamp !== 'coffee' && stamp !== 'bread' && stamp !== 'flower')) return undefined;
  return { envelope, paper, stamp };
}
