import { useEffect, useMemo, useRef, useState } from 'react';
import type { MealEntry } from '../types';
import { BOOK_MONTHS } from '../utils/monthlyBooks';
import { getHeroAssetForMonth } from '../utils/heroAssets';
import { resolveDemoImageAssetUri } from '../demo/demoImageResolver';

export interface MonthlyBookReaderProps {
  month: string;
  scope?: 'personal' | 'sample';
  meals: MealEntry[];
  companions: Record<string, { personId?: string; name: string }[]>;
  locale: 'zh' | 'en';
  onMealPress: (id: string) => void;
  onPersonPress: (id: string) => void;
  onArchive: () => void;
  onClose: () => void;
}

const CHANNEL = 'mealog-photobook-v1';

/** The bundled book owns its layout and gestures; original records stay in Mealog. */
export default function MonthlyBookReader(props: MonthlyBookReaderProps) {
  const { month, meals, locale } = props;
  const frame = useRef<HTMLIFrameElement>(null);
  const current = useRef(props);
  current.current = props;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const payload = useMemo(() => ({
    channel: CHANNEL, type: 'init', month, locale,
    coverUri: resolveDemoImageAssetUri(getHeroAssetForMonth(Number(month.slice(5, 7)) - 1)),
    theme: BOOK_MONTHS[Number(month.slice(5, 7)) - 1] ?? BOOK_MONTHS[0],
    scope: props.scope ?? (meals.length > 0 && meals.every(meal => meal.origin === 'sample') ? 'sample' : 'personal'),
    meals: meals.map(({ id, title, date, time, photoUri, photoThumbnailUri, stickerUri, note }) => ({
      id, title, date, time, photoUri: photoUri || photoThumbnailUri, stickerUri, note, companions: props.companions[id] ?? [],
    })),
  }), [month, meals, locale, props.scope, props.companions]);
  const latestPayload = useRef(payload);
  latestPayload.current = payload;

  useEffect(() => {
    setReady(false);
    setFailed(false);
    const timeout = window.setTimeout(() => setFailed(true), 15000);
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow
        || event.data?.channel !== CHANNEL) return;
      if (event.data.type === 'ready') {
        frame.current?.contentWindow?.postMessage(latestPayload.current, window.location.origin);
      } else if (event.data.type === 'initialized') {
        window.clearTimeout(timeout);
        setReady(true);
        setFailed(false);
      } else if (event.data.type === 'error') {
        window.clearTimeout(timeout);
        setFailed(true);
      } else if (event.data.type === 'meal' && typeof event.data.id === 'string'
        && current.current.meals.some(meal => meal.id === event.data.id)) {
        current.current.onMealPress(event.data.id);
      } else if (event.data.type === 'person' && typeof event.data.id === 'string'
        && current.current.meals.some(meal => current.current.companions[meal.id]?.some(person => person.personId === event.data.id))) {
        current.current.onPersonPress(event.data.id);
      } else if (event.data.type === 'archive') current.current.onArchive();
      else if (event.data.type === 'close') current.current.onClose();
    };
    window.addEventListener('message', receive);
    return () => { window.clearTimeout(timeout); window.removeEventListener('message', receive); };
  }, [month, locale, attempt]);

  useEffect(() => {
    if (ready) frame.current?.contentWindow?.postMessage(payload, window.location.origin);
  }, [payload, ready]);

  return <div style={{ flex: 1, position: 'relative', width: '100%', minHeight: 440, display: 'flex', background: '#f4f1e9' }}>
    <iframe ref={frame} key={`${month}/${locale}/${attempt}`}
      src="/photobook-runtime/index.html" title={locale === 'zh' ? `${month} 美食回忆相册` : `${month} food memory book`}
      onLoad={() => frame.current?.contentWindow?.postMessage({ channel: CHANNEL, type: 'hello' }, window.location.origin)}
      style={{ display: 'block', width: '100%', height: '100%', minHeight: 440, flex: 1, border: 0 }} />
    {!ready && !failed && <div role="status" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#f4f1e9', color: '#575c4c', fontSize: 14 }}>
      {locale === 'zh' ? '正在打开这一个月…' : 'Opening this month…'}
    </div>}
    {failed && <div role="alert" style={{ position: 'absolute', inset: 0, display: 'flex', gap: 16, padding: 28, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#f4f1e9', color: '#464b3c' }}>
      <p>{locale === 'zh' ? '相册暂时无法打开。美食记录仍在档案里。' : 'The book could not open. Your memories are still in the archive.'}</p>
      <button style={{ minHeight: 44, padding: '0 18px' }} onClick={() => setAttempt(value => value + 1)}>{locale === 'zh' ? '重新打开' : 'Try again'}</button>
      <button style={{ minHeight: 44, padding: '0 18px' }} onClick={props.onArchive}>{locale === 'zh' ? '查看食物档案' : 'Open food archive'}</button>
      <button style={{ minHeight: 44, padding: '0 18px' }} onClick={props.onClose}>{locale === 'zh' ? '返回书架' : 'Back to shelf'}</button>
    </div>}
  </div>;
}
