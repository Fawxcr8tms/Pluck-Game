import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useTheme } from '../lib/theme';

export default function FilterBar({ options, value, onChange }) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityState={{ selected: active }}
            style={[styles.chip, { backgroundColor: active ? t.accent : t.chip }]}
          >
            <Text style={[styles.label, { color: active ? t.accentText : t.text }]}>
              {o.label}
              {o.count != null ? `  ${o.count}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 12, gap: 8, paddingVertical: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  label: { fontWeight: '600', fontSize: 13 },
});
