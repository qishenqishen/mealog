import type { CSSProperties } from 'react';
import { Image, Platform } from 'react-native';
import type { SlowMailStationery } from '../product/slowMailStationery';

const envelopes = {
  oat: { back: '#C9B593', front: '#E6D6B6', flap: '#F0E2C6', edge: '#B7A17E' },
  sage: { back: '#A2B29B', front: '#BECCB6', flap: '#D6DFC9', edge: '#8DA086' },
  clay: { back: '#C2947F', front: '#DBB19A', flap: '#EAC9B6', edge: '#AB806C' },
};
const papers = { ivory: '#FFFCF3', cream: '#F4E8CB', sage: '#EDF0DE' };
const sealtone = { coffee: '#6D5944', bread: '#935D43', flower: '#57694F' };

export const SLOW_MAIL_OPENING_MS = 1080;
export const slowMailEnvelopeColor = (id: SlowMailStationery['envelope']) => envelopes[id].front;
export const slowMailPaperColor = (id: SlowMailStationery['paper']) => papers[id];

export function SlowMailStampPreview({ stamp }: { stamp: SlowMailStationery['stamp'] }) {
  if (Platform.OS !== 'web') return null;
  return <span aria-hidden="true" className="mm-stamp-preview" style={{ backgroundColor: sealtone[stamp] }}>
    <span className={`mm-wax-imprint mm-wax-${stamp}`} />
  </span>;
}

export function prefersReducedMailMotion() {
  return Platform.OS !== 'web' || typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function SlowMailEnvelope({ stationery, opening = false, compact = false }: {
  stationery: SlowMailStationery;
  opening?: boolean;
  compact?: boolean;
}) {
  if (Platform.OS !== 'web') return <Image accessible={false} source={require('../../assets/keepsakes/pastel-v1/monthly-letter.png')}
    resizeMode="contain" style={{ width: compact ? 96 : 230, height: compact ? 70 : 156 }} />;
  const material = envelopes[stationery.envelope];
  const palette = {
    '--mm-back': material.back,
    '--mm-front': material.front,
    '--mm-flap': material.flap,
    '--mm-edge': material.edge,
    '--mm-paper': slowMailPaperColor(stationery.paper),
    '--mm-wax': sealtone[stationery.stamp],
  } as CSSProperties;
  return <div aria-hidden="true" className={compact ? 'mm-envelope-scene mm-envelope-mini' : 'mm-envelope-scene'} style={palette}>
    <style>{envelopeStyles}</style>
    <div className="mm-envelope-shape" data-opening={opening ? 'true' : undefined}>
      <div className="mm-envelope-back" />
      <div className="mm-envelope-insert">
        <div className="mm-envelope-rule" /><div className="mm-envelope-rule" /><div className="mm-envelope-rule" />
      </div>
      <div className="mm-envelope-pocket" />
      <div className="mm-envelope-flap" />
      <div className="mm-envelope-seal" key={stationery.stamp}>
        <span className={`mm-wax-imprint mm-wax-${stationery.stamp}`} />
      </div>
    </div>
  </div>;
}

const envelopeStyles = `
.mm-envelope-scene{
  width:100%;max-width:320px;align-self:center;
  padding:96px 18px 24px;pointer-events:none;
}
.mm-envelope-mini{max-width:144px;padding:3px 1px 5px;}
.mm-envelope-shape{
  position:relative;isolation:isolate;aspect-ratio:1.63;
  perspective:750px;
}
.mm-envelope-back{
  position:absolute;inset:0;border:1px solid var(--mm-edge);border-radius:5px;
  background:var(--mm-back);box-shadow:0 13px 23px -9px #33271869,0 2px 4px #33271820;
}
.mm-envelope-pocket{
  position:absolute;z-index:3;inset:0;border-radius:5px;
  clip-path:polygon(0 0,50% 60%,100% 0,100% 100%,0 100%);
  background:
    url('/photobook-runtime/style/paper-grain.svg'),
    linear-gradient(147deg,transparent 49.5%,#32281720 50%,transparent 50.6%),
    linear-gradient(213deg,transparent 49.5%,#32281720 50%,transparent 50.6%),
    linear-gradient(164deg,#ffffff32,transparent 61%),
    var(--mm-front);
}
.mm-envelope-flap{
  position:absolute;z-index:4;left:0;right:0;top:0;height:63%;border-radius:5px 5px 8px 8px;
  transform-origin:center top;
  clip-path:polygon(0 0,100% 0,55% 96%,52% 99%,48% 99%,45% 96%);
  background:url('/photobook-runtime/style/paper-grain.svg'),linear-gradient(170deg,#fff4,var(--mm-flap) 60%,var(--mm-edge) 100%);
}
.mm-envelope-insert{
  position:absolute;z-index:2;inset:10% 9.5% 5%;border-radius:2px;
  border:1px solid #57473526;background:var(--mm-paper) url('/photobook-runtime/style/paper-grain.svg');
  box-shadow:0 3px 9px #33271826;opacity:0;
  padding:9% 9%;
}
.mm-envelope-rule{height:1px;margin:0 0 9%;background:#5b4d3424;width:88%;}
.mm-envelope-rule:first-child{width:42%;background:#5b4d3450;margin-bottom:12%;}
.mm-envelope-rule:last-child{width:66%;}
.mm-envelope-seal{
  position:absolute;z-index:5;top:61%;left:50%;translate:-50% -50%;display:grid;place-items:center;
  width:45px;height:44px;border-radius:48% 47% 48% 49%;
  transform:rotate(-9deg);
  color:#ffebc9;background:radial-gradient(ellipse at 38% 29%,#fff4 0%,transparent 48%),var(--mm-wax);
  border:1px solid #2b201f55;box-shadow:inset 0 0 0 3px #fff2,inset 0 0 0 6px #251a1b35,0 3px 4px #271b2352;
}
.mm-envelope-mini .mm-envelope-back{box-shadow:0 3px 6px #33271829;}
.mm-envelope-mini .mm-envelope-seal{scale:.48;box-shadow:inset 0 0 0 4px #fff2,0 3px 5px #271b2352;animation:mm-press-seal 250ms ease-out both;}
.mm-stamp-preview{display:grid;place-items:center;color:#ffebc9;border-radius:50%;width:23px;height:23px;flex:none;}
.mm-stamp-preview .mm-wax-imprint{transform:scale(.78);}
.mm-wax-imprint{position:relative;display:block;width:16px;height:14px;}
.mm-wax-coffee{height:11px;width:13px;border:1px solid currentColor;border-radius:1px 1px 5px 5px;margin:2px 3px 0 0;}
.mm-wax-coffee::before{
  content:'';position:absolute;left:100%;top:0;width:4px;height:6px;
  border:1px solid currentColor;border-left:0;border-radius:0 4px 4px 0;
}
.mm-wax-coffee::after{
  content:'';position:absolute;left:-3px;right:-4px;bottom:-4px;border-bottom:1px solid currentColor;border-radius:50%;
}
.mm-wax-bread{height:15px;width:14px;border:1px solid currentColor;border-radius:6px 6px 2px 2px;}
.mm-wax-bread::before{
  content:'';position:absolute;inset:5px 2px 3px;transform:rotate(-27deg);
  background:repeating-linear-gradient(to right,transparent 0 2px,currentColor 2px 3px);
}
.mm-wax-flower{
  width:5px;height:5px;border-radius:50%;background:currentColor;
  box-shadow:0 -5px 0 0 currentColor,5px -1px 0 0 currentColor,3px 4px 0 0 currentColor,
             -3px 4px 0 0 currentColor,-5px -1px 0 0 currentColor;
}
.mm-envelope-shape[data-opening=true] .mm-envelope-seal{animation:mm-break-seal 290ms ease-in forwards;}
.mm-envelope-shape[data-opening=true] .mm-envelope-flap{animation:mm-lift-flap 460ms 140ms cubic-bezier(.2,.7,.27,1) both;}
.mm-envelope-shape[data-opening=true] .mm-envelope-insert{animation:mm-draw-paper 580ms 470ms cubic-bezier(.2,.63,.22,1) both;}
@keyframes mm-press-seal{
  0%{transform:rotate(-9deg) scale(1.38);opacity:.45;}
  100%{transform:rotate(-9deg) scale(1);opacity:1;}
}
@keyframes mm-break-seal{
  0%{transform:rotate(-9deg);opacity:1;}
  36%{transform:translateY(-3px) rotate(-17deg) scale(1.12);opacity:1;}
  100%{transform:translate(18px,15px) rotate(16deg) scale(.9);opacity:0;}
}
@keyframes mm-lift-flap{
  0%{transform:rotateX(0);z-index:4;}
  49%{z-index:4;}
  51%{z-index:1;}
  100%{transform:rotateX(171deg);z-index:1;}
}
@keyframes mm-draw-paper{
  0%{opacity:1;transform:translateY(10%) rotate(0);}
  82%,100%{opacity:1;transform:translateY(-51%) rotate(-3deg);}
}
@media(prefers-reduced-motion:reduce){
  .mm-envelope-mini .mm-envelope-seal,
  .mm-envelope-shape[data-opening=true] .mm-envelope-seal,
  .mm-envelope-shape[data-opening=true] .mm-envelope-flap,
  .mm-envelope-shape[data-opening=true] .mm-envelope-insert{animation:none;}
}
`;
