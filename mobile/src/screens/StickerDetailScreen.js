import * as Clipboard from 'expo-clipboard';
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PLATFORM_LABEL, useTheme } from '../lib/theme';
import { packFor, sendPackToWhatsApp, whatsappErrorMessage } from '../native/stickerExport';
import { useVault } from '../state/VaultContext';

export default function StickerDetailScreen({ route, navigation }) {
  const t = useTheme();
  const { stickers, updateTags, toggleFavorite, remove, ensureLocalFile } = useVault();
  const sticker = stickers.find((s) => s.id === route.params.id);
  const [newTag, setNewTag] = useState('');
  const [busy, setBusy] = useState(null);

  if (!sticker) {
    return (
      <View style={[styles.root, { backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: t.muted }}>This sticker flew away.</Text>
      </View>
    );
  }

  const run = (label, fn) => async () => {
    setBusy(label);
    try {
      await fn(await ensureLocalFile(sticker));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("That didn't work", e.message);
    } finally {
      setBusy(null);
    }
  };

  // System share sheet: WhatsApp, Telegram, iMessage, Signal, Discord... anything that accepts images.
  const share = run('share', (uri) => Sharing.shareAsync(uri, { mimeType: 'image/webp', UTI: 'org.webmproject.webp', dialogTitle: 'Send sticker' }));

  // Copy -> paste into any keyboard/app that accepts images (Gboard, iMessage, Slack, ...). Static only.
  const copy = run('copy', async (uri) => {
    await Clipboard.setImageAsync(await new File(uri).base64());
    if (sticker.animated) Alert.alert('Copied', 'Heads up: the clipboard only keeps the first frame. Use Share to send the animated version.');
  });

  const saveToPhotos = run('photos', async (uri) => {
    const { granted } = await MediaLibrary.requestPermissionsAsync(true);
    if (!granted) throw new Error('Pluck needs permission to add photos.');
    // Recent iOS and Android accept WebP here. If an older device refuses, convert to PNG with expo-image-manipulator first.
    await MediaLibrary.saveToLibraryAsync(uri);
  });

  const whatsapp = async () => {
    const pack = packFor(stickers, sticker.id);
    try {
      await sendPackToWhatsApp(pack, ensureLocalFile);
    } catch (e) {
      Alert.alert('WhatsApp', whatsappErrorMessage(e, pack));
    }
  };

  const addTag = () => {
    const tag = newTag.trim().toLowerCase();
    setNewTag('');
    if (tag && !sticker.tags?.includes(tag)) updateTags(sticker.id, [...(sticker.tags ?? []), tag]);
  };

  const confirmDelete = () =>
    Alert.alert('Delete sticker?', 'It will be removed from all your devices.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await remove(sticker.id);
          navigation.goBack();
        },
      },
    ]);

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.root}>
      <View style={[styles.stage, { backgroundColor: t.card, borderColor: t.border }]}>
        <Image source={{ uri: sticker.localUri ?? sticker.url }} style={styles.hero} contentFit="contain" autoplay />
      </View>

      <View style={styles.metaRow}>
        <Pressable
          disabled={!sticker.sourceUrl}
          onPress={() => WebBrowser.openBrowserAsync(sticker.sourceUrl)}
          style={[styles.pill, { backgroundColor: t.chip }]}
        >
          <Text style={{ color: t.text, fontWeight: '700' }}>
            {PLATFORM_LABEL[sticker.sourcePlatform] ?? 'Web'}
            {sticker.sourceUrl ? ' ↗' : ''}
          </Text>
        </Pressable>
        <Text style={{ color: t.muted }}>Saved {new Date(sticker.createdAt).toLocaleDateString()}</Text>
        <Pressable onPress={() => toggleFavorite(sticker)} accessibilityLabel="Favourite" style={styles.star}>
          <Text style={{ fontSize: 26, color: sticker.favorite ? '#FFB400' : t.muted }}>{sticker.favorite ? '★' : '☆'}</Text>
        </Pressable>
      </View>

      <Text style={[styles.section, { color: t.muted }]}>TAGS</Text>
      <View style={styles.tags}>
        {(sticker.tags ?? []).map((tag) => (
          <Pressable
            key={tag}
            onPress={() => updateTags(sticker.id, sticker.tags.filter((x) => x !== tag))}
            style={[styles.pill, { backgroundColor: t.chip }]}
          >
            <Text style={{ color: t.text }}>#{tag} ✕</Text>
          </Pressable>
        ))}
        <TextInput
          value={newTag}
          onChangeText={setNewTag}
          onSubmitEditing={addTag}
          placeholder="+ add tag"
          placeholderTextColor={t.muted}
          autoCapitalize="none"
          returnKeyType="done"
          style={[styles.tagInput, { color: t.text, borderColor: t.border }]}
        />
      </View>

      <Text style={[styles.section, { color: t.muted }]}>SEND IT</Text>
      <View style={styles.actions}>
        <Action t={t} icon="📤" label="Share" onPress={share} busy={busy === 'share'} primary />
        <Action t={t} icon="📋" label="Copy" onPress={copy} busy={busy === 'copy'} />
        <Action t={t} icon="🖼️" label="Save to Photos" onPress={saveToPhotos} busy={busy === 'photos'} />
        <Action t={t} icon="💬" label="Send to WhatsApp" onPress={whatsapp} disabled={!sticker.whatsappCompatible} />
      </View>
      {!sticker.whatsappCompatible && (
        <Text style={{ color: t.muted, fontSize: 12 }}>This one is too big for WhatsApp's 500 KB animated-sticker limit.</Text>
      )}

      <Pressable onPress={confirmDelete} style={styles.delete}>
        <Text style={{ color: '#D93025', fontWeight: '700' }}>Delete from vault</Text>
      </Pressable>
    </ScrollView>
  );
}

function Action({ t, icon, label, onPress, busy, disabled, primary }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: primary ? t.accent : t.card, borderColor: t.border, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
      ]}
    >
      <Text style={{ fontSize: 22 }}>{busy ? '⏳' : icon}</Text>
      <Text style={{ color: primary ? t.accentText : t.text, fontWeight: '700', marginTop: 4 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { padding: 16, paddingBottom: 48 },
  stage: { aspectRatio: 1, borderRadius: 24, borderWidth: 1, padding: 24 },
  hero: { flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  star: { marginLeft: 'auto', padding: 4 },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  section: { fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: 22, marginBottom: 8 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  tagInput: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, minWidth: 100 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: { width: '47%', flexGrow: 1, borderRadius: 16, borderWidth: 1, paddingVertical: 16, alignItems: 'center' },
  delete: { alignItems: 'center', marginTop: 32, padding: 12 },
});
