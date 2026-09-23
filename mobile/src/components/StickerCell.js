import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../lib/theme';

function StickerCell({ sticker, size, onPress, onLongPress, selected }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="imagebutton"
      accessibilityLabel={sticker.tags?.length ? `Sticker: ${sticker.tags.join(', ')}` : 'Sticker'}
      style={({ pressed }) => [
        styles.cell,
        { width: size, height: size, backgroundColor: t.card, borderColor: selected ? t.accent : t.border },
        selected && styles.selected,
        pressed && { transform: [{ scale: 0.96 }] },
      ]}
    >
      <Image
        // Local file first (offline), then the thumbnail, then the full URL for raw candidates.
        source={{ uri: sticker.localUri ?? sticker.thumbUrl ?? sticker.url }}
        style={styles.img}
        contentFit="contain"
        transition={120}
        recyclingKey={sticker.id ?? sticker.url}
        autoplay
      />
      {sticker.favorite && <Text style={styles.badge}>★</Text>}
      {sticker.animated && (
        <View style={[styles.gif, { backgroundColor: t.accent }]}>
          <Text style={[styles.gifText, { color: t.accentText }]}>GIF</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: { margin: 4, borderRadius: 18, borderWidth: 1, padding: 8, overflow: 'hidden' },
  selected: { borderWidth: 3 },
  img: { flex: 1 },
  badge: { position: 'absolute', top: 6, left: 8, fontSize: 14, color: '#FFB400' },
  gif: { position: 'absolute', bottom: 6, right: 6, borderRadius: 6, paddingHorizontal: 4 },
  gifText: { fontSize: 9, fontWeight: '800' },
});

export default memo(StickerCell);
