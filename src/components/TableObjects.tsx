import { Image, StyleSheet, Text, View } from 'react-native';
import { getKeepsakeArt } from '../constants/keepsakeArt';

// Decorative choices never become meal facts or AI context.
export const PLATES = [
  { zh: '奶油瓷', en: 'Porcelain', rim: '#DBD3BA', well: '#FAF8EB', ink: '#877D62' },
  { zh: '蓝边条纹', en: 'Blue stripe', rim: '#385F9A', well: '#F6F1E2', ink: '#385F9A' },
  { zh: '开心果绿', en: 'Pistachio', rim: '#9DA97E', well: '#DCE2C3', ink: '#5F714B' },
  { zh: '陶土花边', en: 'Terracotta', rim: '#B76D50', well: '#E9B497', ink: '#854931' },
] as const;
export const CHAIRS = [
  { zh: '薄荷木椅', en: 'Mint chair', key: 'people-pulled-chair' },
  { zh: '弯木椅', en: 'Bentwood', key: 'people-old-friend-seat' },
  { zh: '软绒椅', en: 'Soft armchair', key: 'people-cushion-chair' },
  { zh: '蓝色圆凳', en: 'Blue stool', key: 'people-regular-seat' },
] as const;
export function TableChair({ variant, size = 42 }: { variant: number; size?: number }) {
  return <Image source={getKeepsakeArt(CHAIRS[variant].key)} style={{ width: size, height: size }} resizeMode="contain" aria-hidden/>;
}
export function TablePlate({ variant }: { variant: number }) {
  const plate = PLATES[variant];
  return <View style={styles.setting} aria-hidden>
    <View style={styles.fork}><View style={styles.forkHead}>{[0, 1, 2, 3].map(tine => <View key={tine} style={styles.tine}/>)}</View><View style={styles.stem}/><View style={[styles.handle, { backgroundColor: plate.ink }]}><View style={styles.rivet}/><View style={styles.rivet}/></View></View>
    <View style={styles.plateWrap}>
      {variant === 3 && Array.from({ length: 16 }, (_, i) => { const angle = i * Math.PI / 8; return <View key={i} style={[styles.scallop, { backgroundColor: plate.rim, left: 63 + Math.cos(angle) * 62, top: 63 + Math.sin(angle) * 62 }]}/>; })}
      <View style={[styles.plate, { backgroundColor: plate.rim, borderColor: plate.ink }]}>
        {variant === 1 && Array.from({ length: 20 }, (_, i) => <View key={i} style={[styles.stripe, { transform: [{ rotate: `${i * 18}deg` }, { translateY: -61 }] }]}/>)}
        <View style={[styles.well, { backgroundColor: plate.well, borderColor: plate.ink }]}><View style={styles.innerRing}><Text style={[styles.plus, { color: plate.ink }]}>＋</Text></View></View>
      </View>
    </View>
    <View style={styles.knife}><View style={styles.blade}/><View style={[styles.handle, { backgroundColor: plate.ink }]}><View style={styles.rivet}/><View style={styles.rivet}/></View></View>
  </View>;
}
const styles = StyleSheet.create({
  setting: { width: 224, height: 148, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 15 },
  plateWrap: { width: 148, height: 148, alignItems: 'center', justifyContent: 'center' },
  plate: { width: 138, height: 138, borderRadius: 69, borderWidth: 1, alignItems: 'center', justifyContent: 'center', shadowColor: '#5A4533', shadowOpacity: 0.13, shadowRadius: 4, shadowOffset: { width: 0, height: 3 } },
  well: { width: 103, height: 103, borderRadius: 52, borderWidth: 0.7, alignItems: 'center', justifyContent: 'center' }, innerRing: { width: 92, height: 92, borderRadius: 46, borderWidth: 1, borderColor: 'rgba(255,255,255,.65)', alignItems: 'center', justifyContent: 'center' }, plus: { fontSize: 27, fontWeight: '300' },
  stripe: { position: 'absolute', width: 4, height: 12, backgroundColor: '#F6F1E2', borderRadius: 2 }, scallop: { position: 'absolute', width: 23, height: 23, borderRadius: 12 },
  fork: { width: 13, alignItems: 'center' }, forkHead: { flexDirection: 'row', width: 13, height: 21, justifyContent: 'space-between', borderBottomWidth: 4, borderBottomColor: '#B1B0A4', borderBottomLeftRadius: 5, borderBottomRightRadius: 5 }, tine: { width: 2, height: 19, backgroundColor: '#B1B0A4', borderRadius: 1 }, stem: { width: 4, height: 16, backgroundColor: '#B1B0A4' }, handle: { width: 9, height: 52, borderRadius: 5, alignItems: 'center', justifyContent: 'space-around', paddingVertical: 9 }, rivet: { width: 2.5, height: 2.5, borderRadius: 2, backgroundColor: '#EAE7DB' }, knife: { alignItems: 'center', width: 13 }, blade: { width: 10, height: 42, backgroundColor: '#B1B0A4', borderTopRightRadius: 9, borderTopLeftRadius: 2, borderBottomRightRadius: 3 },
});
