import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SlowMailStationery } from '../product/slowMailStationery';
import { colors, fonts } from '../theme';
import SlowMailEnvelope, { SlowMailStampPreview, slowMailEnvelopeColor, slowMailPaperColor } from './SlowMailEnvelope';

type Choice<Id extends string> = { id: Id; en: string; zh: string; swatch?: string };
const choices = {
  envelope: [
    { id: 'oat', en: 'Oat', zh: '燕麦纸', swatch: slowMailEnvelopeColor('oat') },
    { id: 'sage', en: 'Sage', zh: '鼠尾草', swatch: slowMailEnvelopeColor('sage') },
    { id: 'clay', en: 'Clay', zh: '赤陶', swatch: slowMailEnvelopeColor('clay') },
  ],
  paper: [
    { id: 'ivory', en: 'Ivory', zh: '象牙白', swatch: slowMailPaperColor('ivory') },
    { id: 'cream', en: 'Cream', zh: '奶油纸', swatch: slowMailPaperColor('cream') },
    { id: 'sage', en: 'Moss', zh: '浅苔绿', swatch: slowMailPaperColor('sage') },
  ],
  stamp: [
    { id: 'coffee', en: 'Coffee cup', zh: '咖啡杯' },
    { id: 'bread', en: 'Toast', zh: '一片吐司' },
    { id: 'flower', en: 'Flower', zh: '小花' },
  ],
} satisfies { [Field in keyof SlowMailStationery]: Choice<SlowMailStationery[Field]>[] };

const groups = [
  { key: 'envelope', en: 'Envelope', zh: '信封' },
  { key: 'paper', en: 'Letter paper', zh: '信纸' },
  { key: 'stamp', en: 'Postmark', zh: '盖邮戳' },
] as const;

const ink = '#414737';
const line = '#CFC7B5';

export default function SlowMailStationeryPicker({ stationery, onChange, zh, disabled }: {
  stationery: SlowMailStationery;
  onChange: (stationery: SlowMailStationery) => void;
  zh: boolean;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const language = zh ? 'zh' : 'en';
  const label = zh ? '选信封、信纸和邮戳' : 'Choose envelope, paper and stamp';
  const summary = groups.map(({ key }) => choices[key].find(choice => choice.id === stationery[key])?.[language]).join(' · ');

  return <View style={styles.picker}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded }} aria-expanded={expanded}
      onPress={() => setExpanded(value => !value)} style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}>
      <View aria-hidden style={styles.preview}><SlowMailEnvelope stationery={stationery} compact /></View>
      <View style={styles.labelGroup}>
        <Text style={styles.heading}>{label}</Text>
        <Text style={styles.summary}>{summary}</Text>
      </View>
      <View aria-hidden style={[styles.chevron, expanded && styles.openChevron]} />
    </Pressable>
    {expanded && <View style={styles.choices}>
      {groups.map(({ key, ...group }) => <View key={key} accessibilityRole="radiogroup" accessibilityLabel={group[language]} style={styles.group}>
        <Text style={styles.groupLabel}>{group[language]}</Text>
        <View style={styles.options}>
          {choices[key].map((option: Choice<SlowMailStationery[typeof key]>) => {
            const checked = stationery[key] === option.id;
            return <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={option[language]}
              accessibilityState={{ checked, disabled }} aria-checked={checked} disabled={disabled}
              onPress={() => onChange({ ...stationery, [key]: option.id })}
              style={({ pressed }) => [styles.option, key === 'stamp' && styles.stampOption, checked && styles.selected, pressed && styles.pressed]}>
              {key === 'stamp'
                ? <SlowMailStampPreview stamp={option.id as SlowMailStationery['stamp']} />
                : <View aria-hidden style={[styles.swatch, { backgroundColor: option.swatch }]} />}
              <Text style={[styles.optionLabel, checked && styles.selectedLabel]}>{option[language]}</Text>
            </Pressable>;
          })}
        </View>
      </View>)}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  picker: { borderWidth: 1, borderColor: line, borderRadius: 4, overflow: 'hidden' },
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8, minHeight: 72, backgroundColor: '#EEEBDC' },
  preview: { width: 86, alignItems: 'center', justifyContent: 'center' },
  labelGroup: { flex: 1, minWidth: 0, gap: 4 },
  heading: { color: colors.primary, fontFamily: fonts.editorial, fontSize: 15, lineHeight: 20 },
  summary: { color: colors.secondary, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  chevron: { width: 7, height: 7, borderRightWidth: 1, borderBottomWidth: 1, borderColor: ink, transform: [{ rotate: '45deg' }], marginRight: 4 },
  openChevron: { transform: [{ rotate: '225deg' }] },
  choices: { gap: 9, padding: 10, backgroundColor: colors.surface },
  group: { gap: 4 },
  groupLabel: { color: ink, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  options: { flexDirection: 'row', gap: 5 },
  option: { flex: 1, minWidth: 0, minHeight: 44, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4, paddingHorizontal: 4, paddingVertical: 4, borderWidth: 1, borderColor: line, borderRadius: 3 },
  stampOption: { minHeight: 56, flexDirection: 'column', gap: 2 },
  selected: { backgroundColor: '#E7E8DB', borderColor: ink },
  pressed: { opacity: 0.82 },
  swatch: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: line },
  optionLabel: { flexShrink: 1, textAlign: 'center', color: colors.primary, fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  selectedLabel: { color: ink, fontWeight: '600' },
});
