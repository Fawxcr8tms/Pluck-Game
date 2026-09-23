import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FilterBar from '../components/FilterBar';
import StickerCell from '../components/StickerCell';
import { useClipboardLink } from '../hooks/useClipboardLink';
import { PLATFORM_LABEL, useTheme } from '../lib/theme';
import { useVault } from '../state/VaultContext';

const COLUMNS = 3;

export default function VaultScreen({ navigation }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const { stickers, ready, syncError } = useVault();
  const clip = useClipboardLink();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filters = useMemo(() => {
    const counts = {};
    for (const s of stickers) counts[s.sourcePlatform] = (counts[s.sourcePlatform] ?? 0) + 1;
    return [
      { key: 'all', label: 'All', count: stickers.length },
      { key: 'fav', label: '★ Faves', count: stickers.filter((s) => s.favorite).length },
      ...Object.keys(counts).sort().map((p) => ({ key: p, label: PLATFORM_LABEL[p] ?? p, count: counts[p] })),
    ];
  }, [stickers]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stickers.filter((s) => {
      if (filter === 'fav' && !s.favorite) return false;
      if (filter !== 'all' && filter !== 'fav' && s.sourcePlatform !== filter) return false;
      if (q && !s.tags?.some((tag) => tag.includes(q))) return false;
      return true;
    });
  }, [stickers, filter, search]);

  const cellSize = (width - 16) / COLUMNS - 8;

  const importFromClipboard = async () => {
    const url = await clip.takeLink();
    navigation.navigate('Import', { url });
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text }]}>Pluck</Text>
        <Text style={[styles.subtitle, { color: t.muted }]}>
          {stickers.length} sticker{stickers.length === 1 ? '' : 's'} rescued from the comment section
        </Text>
      </View>

      {clip.hasLink && (
        <Pressable onPress={importFromClipboard} style={[styles.banner, { backgroundColor: t.accent }]}>
          <Text style={[styles.bannerText, { color: t.accentText }]}>📋 Copied a link? Tap to pluck stickers from it</Text>
          <Text onPress={clip.dismiss} style={[styles.bannerX, { color: t.accentText }]} accessibilityLabel="Dismiss">
            ✕
          </Text>
        </Pressable>
      )}

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search tags (e.g. cat, mood, lol)"
        placeholderTextColor={t.muted}
        autoCapitalize="none"
        style={[styles.search, { backgroundColor: t.card, color: t.text, borderColor: t.border }]}
      />
      <FilterBar options={filters} value={filter} onChange={setFilter} />
      {syncError && <Text style={[styles.sync, { color: t.muted }]}>Offline: showing your saved copy.</Text>}

      <FlatList
        data={visible}
        keyExtractor={(s) => s.id}
        numColumns={COLUMNS}
        contentContainerStyle={styles.grid}
        initialNumToRender={24}
        windowSize={7}
        removeClippedSubviews
        renderItem={({ item }) => (
          <StickerCell sticker={item} size={cellSize} onPress={() => navigation.navigate('StickerDetail', { id: item.id })} />
        )}
        ListEmptyComponent={
          ready && (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🦅</Text>
              <Text style={[styles.emptyTitle, { color: t.text }]}>
                {stickers.length ? 'Nothing matches that filter.' : 'Your vault is emptier than a comment section at 4am.'}
              </Text>
              <Text style={[styles.emptyBody, { color: t.muted }]}>
                Share a post from Instagram, TikTok, Facebook or YouTube to Pluck, or tap + and paste a link.
              </Text>
            </View>
          )
        }
      />

      <Pressable
        onPress={() => navigation.navigate('Import', {})}
        accessibilityLabel="Add stickers"
        style={({ pressed }) => [styles.fab, { backgroundColor: t.accent, opacity: pressed ? 0.8 : 1 }]}
      >
        <Text style={[styles.fabText, { color: t.accentText }]}>+</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  subtitle: { fontSize: 14, marginTop: 2 },
  banner: { margin: 12, marginBottom: 0, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center' },
  bannerText: { flex: 1, fontWeight: '700' },
  bannerX: { fontSize: 16, paddingHorizontal: 6, fontWeight: '800' },
  search: { marginHorizontal: 12, marginTop: 12, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  sync: { paddingHorizontal: 16, fontSize: 12 },
  grid: { paddingHorizontal: 8, paddingBottom: 120 },
  empty: { alignItems: 'center', padding: 32, marginTop: 40 },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  emptyBody: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  fab: { position: 'absolute', right: 20, bottom: 36, width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  fabText: { fontSize: 34, fontWeight: '600', marginTop: -2 },
});
