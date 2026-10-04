import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import StickerCell from '../components/StickerCell';
import { findUrl } from '../lib/links';
import { useTheme } from '../lib/theme';
import { extractFromLink } from '../services/api';
import { useVault } from '../state/VaultContext';

const ERROR_COPY = {
  AUTH_REQUIRED: "This post is behind a login wall, so our scraper can't see it. You can still grab the sticker yourself:",
  NO_STICKERS: "We couldn't spot any stickers there. If you can see one, capture it yourself:",
  RATE_LIMITED: 'That site asked us to slow down.',
  OFFLINE: "You're offline. Your vault still works; importing needs a connection.",
  BLOCKED_URL: "We can't open that kind of link.",
  INVALID_URL: "That doesn't look like a link.",
};

/** Upload up to `limit` at a time, reporting progress. */
async function saveAll(items, save, onProgress, limit = 3) {
  let done = 0;
  const failures = [];
  const queue = [...items];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      try {
        await save(item);
      } catch (e) {
        failures.push(e);
      }
      onProgress(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return failures;
}

export default function ImportScreen({ route, navigation }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const { save } = useVault();
  const [url, setUrl] = useState(route.params?.url ?? '');
  const [state, setState] = useState({ phase: 'idle' }); // idle | loading | results | error | saving
  const [selected, setSelected] = useState(new Set());
  const [tags, setTags] = useState('');

  const parsedTags = tags.split(/[,\s]+/).filter(Boolean);

  const pluck = useCallback(async (target) => {
    const link = findUrl(target);
    if (!link) return setState({ phase: 'error', error: { code: 'INVALID_URL' } });
    setState({ phase: 'loading' });
    try {
      const result = await extractFromLink(link);
      setSelected(new Set(result.candidates.filter((c) => c.kind === 'sticker').map((c) => c.url)));
      setState({ phase: 'results', result });
    } catch (error) {
      setState({ phase: 'error', error });
    }
  }, []);

  // Arrived from the share sheet or the clipboard banner: go straight away.
  useEffect(() => {
    if (route.params?.url) pluck(route.params.url);
  }, [route.params?.url, pluck]);

  const finish = (saved, failures) => {
    Haptics.notificationAsync(failures.length ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
    if (failures.length && !saved) return setState({ phase: 'error', error: failures[0] });
    navigation.goBack();
  };

  const saveSelected = async () => {
    const picks = state.result.candidates.filter((c) => selected.has(c.url));
    setState({ phase: 'saving', done: 0, total: picks.length });
    const failures = await saveAll(
      picks,
      (c) => save({ imageUrl: c.url, sourceUrl: state.result.sourceUrl, platform: state.result.platform, tags: parsedTags }),
      (done) => setState((s) => ({ ...s, done })),
    );
    finish(picks.length - failures.length, failures);
  };

  // Manual capture: pick the screenshot, then tap the sticker on the cut-out screen.
  const captureManually = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    navigation.replace('Cutout', { uri: res.assets[0].uri, sourceUrl: findUrl(url) });
  };

  const toggle = (u) =>
    setSelected((cur) => {
      const next = new Set(cur);
      next.has(u) ? next.delete(u) : next.add(u);
      Haptics.selectionAsync();
      return next;
    });

  const cellSize = (width - 16) / 3 - 8;

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={styles.inputRow}>
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder="Paste a post or comment link"
          placeholderTextColor={t.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={() => pluck(url)}
          style={[styles.input, { backgroundColor: t.card, color: t.text, borderColor: t.border }]}
        />
        <Pressable onPress={() => pluck(url)} style={[styles.btn, { backgroundColor: t.accent }]} disabled={state.phase === 'loading'}>
          <Text style={[styles.btnText, { color: t.accentText }]}>Pluck</Text>
        </Pressable>
      </View>
      <TextInput
        value={tags}
        onChangeText={setTags}
        placeholder="Tags for these (optional): cat, reaction"
        placeholderTextColor={t.muted}
        autoCapitalize="none"
        style={[styles.input, styles.tags, { backgroundColor: t.card, color: t.text, borderColor: t.border }]}
      />

      {state.phase === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={t.accent} />
          <Text style={[styles.muted, { color: t.muted }]}>Rummaging through the comments…</Text>
        </View>
      )}

      {state.phase === 'saving' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={t.accent} />
          <Text style={[styles.muted, { color: t.muted }]}>
            Saving {state.done}/{state.total}…
          </Text>
        </View>
      )}

      {state.phase === 'error' && (
        <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
          <Text style={[styles.cardTitle, { color: t.text }]}>
            {ERROR_COPY[state.error.code] ?? state.error.message ?? 'Something went wrong.'}
          </Text>
          {state.error.code === 'RATE_LIMITED' && state.error.retryAfterSec != null && (
            <Text style={{ color: t.muted }}>Try again in about {Math.ceil(state.error.retryAfterSec / 60)} min.</Text>
          )}
          {(state.error.fallback === 'manual_capture' || ['AUTH_REQUIRED', 'NO_STICKERS'].includes(state.error.code)) && (
            <ManualCaptureSteps url={findUrl(url)} onPick={captureManually} t={t} />
          )}
        </View>
      )}

      {state.phase === 'results' && (
        <>
          {state.result.warnings?.map((w) => (
            <Text key={w} style={[styles.warning, { color: t.muted }]}>
              ⚠️ {w}
            </Text>
          ))}
          {state.result.fallback === 'manual_capture' && <ManualCaptureSteps url={state.result.sourceUrl} onPick={captureManually} t={t} compact />}
          <FlatList
            data={state.result.candidates}
            keyExtractor={(c) => c.url}
            numColumns={3}
            contentContainerStyle={styles.grid}
            renderItem={({ item }) => (
              <StickerCell sticker={item} size={cellSize} selected={selected.has(item.url)} onPress={() => toggle(item.url)} />
            )}
          />
          <Pressable
            onPress={saveSelected}
            disabled={selected.size === 0}
            style={[styles.saveBar, { backgroundColor: selected.size ? t.accent : t.chip }]}
          >
            <Text style={[styles.btnText, { color: selected.size ? t.accentText : t.muted }]}>
              {selected.size ? `Save ${selected.size} to vault` : 'Tap stickers to select'}
            </Text>
          </Pressable>
        </>
      )}

      {state.phase === 'idle' && (
        <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
          <Text style={[styles.cardTitle, { color: t.text }]}>No link? No problem.</Text>
          <ManualCaptureSteps onPick={captureManually} t={t} compact />
        </View>
      )}
    </View>
  );
}

function ManualCaptureSteps({ url, onPick, t, compact }) {
  return (
    <View style={{ gap: 8, marginTop: compact ? 4 : 12, paddingHorizontal: compact ? 12 : 0 }}>
      {!compact && (
        <Text style={{ color: t.muted, lineHeight: 20 }}>
          1. Open the post and screenshot the comment.{'\n'}2. Pick the screenshot and crop to the sticker.
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {url && (
          <Pressable onPress={() => WebBrowser.openBrowserAsync(url)} style={[styles.ghost, { borderColor: t.accent }]}>
            <Text style={{ color: t.accent, fontWeight: '700' }}>Open post</Text>
          </Pressable>
        )}
        <Pressable onPress={onPick} style={[styles.ghost, { borderColor: t.accent }]}>
          <Text style={{ color: t.accent, fontWeight: '700' }}>✂️ Cut from a screenshot</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 12 },
  inputRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 8 },
  input: { flex: 1, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  tags: { flex: 0, marginHorizontal: 12, marginTop: 8 },
  btn: { borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center' },
  btnText: { fontWeight: '800', fontSize: 16 },
  center: { alignItems: 'center', marginTop: 48, gap: 12 },
  muted: { fontSize: 14 },
  card: { margin: 12, padding: 16, borderRadius: 16, borderWidth: 1, gap: 6 },
  cardTitle: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  warning: { paddingHorizontal: 16, paddingTop: 8, fontSize: 13 },
  grid: { padding: 8, paddingBottom: 100 },
  saveBar: { position: 'absolute', left: 16, right: 16, bottom: 32, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  ghost: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
});
