import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { detectPlatform } from '../lib/links';
import { useTheme } from '../lib/theme';
import { currentPack, liftSubject, nativeAvailable, packFor, sendPackToWhatsApp, whatsappErrorMessage } from '../native/stickerExport';
import { useVault } from '../state/VaultContext';

/**
 * Screenshot in, sticker out:
 *   1. user taps the sticker in their screenshot
 *   2. iOS Vision cuts out whatever is under the finger (iOS 17+), or we fall back to a square crop
 *   3. save to the vault, and optionally push the pack to WhatsApp right away
 */
export default function CutoutScreen({ route, navigation }) {
  const t = useTheme();
  const { addLocal, stickers, ensureLocalFile } = useVault();
  const { uri, sourceUrl = null } = route.params;
  const [natural, setNatural] = useState(null); // image pixel size
  const [box, setBox] = useState(null); // on-screen layout size
  const [phase, setPhase] = useState('pick'); // pick | working | preview | saving
  const [result, setResult] = useState(null);
  const [hint, setHint] = useState(null);

  // expo-image draws with contentFit="contain", so map the tap through the letterboxing.
  const toImagePoint = ({ locationX, locationY }) => {
    if (!natural || !box) return null;
    const k = Math.min(box.width / natural.width, box.height / natural.height);
    const w = natural.width * k, h = natural.height * k;
    const x = (locationX - (box.width - w) / 2) / w;
    const y = (locationY - (box.height - h) / 2) / h;
    return x < 0 || x > 1 || y < 0 || y > 1 ? null : { x, y };
  };

  const squareCrop = async ({ x, y }) => {
    const side = Math.round(Math.min(natural.width, natural.height) * 0.35);
    const originX = Math.max(0, Math.min(natural.width - side, Math.round(x * natural.width - side / 2)));
    const originY = Math.max(0, Math.min(natural.height - side, Math.round(y * natural.height - side / 2)));
    const ref = await ImageManipulator.manipulate(uri).crop({ originX, originY, width: side, height: side }).renderAsync();
    return (await ref.saveAsync({ format: SaveFormat.PNG })).uri;
  };

  const onTap = async (e) => {
    const p = toImagePoint(e.nativeEvent);
    if (!p) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPhase('working');
    setHint(null);
    try {
      setResult({ uri: await liftSubject(uri, p.x, p.y), method: 'lift', point: p });
    } catch (err) {
      // No native module (Expo Go), iOS 16, or Vision found nothing: square crop around the tap instead.
      setResult({ uri: await squareCrop(p), method: 'square', point: p });
      setHint(err.message === 'native_missing' ? 'Square crop (tap-to-cut-out needs the installed app).' : err.message);
    }
    setPhase('preview');
  };

  const save = async ({ thenWhatsApp }) => {
    setPhase('saving');
    try {
      const sticker = await addLocal({ uri: result.uri, sourceUrl, sourcePlatform: sourceUrl ? detectPlatform(sourceUrl) : 'manual' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (!thenWhatsApp) return navigation.popToTop();
      const all = [sticker, ...stickers];
      const pack = packFor(all, sticker.id);
      try {
        await sendPackToWhatsApp(pack, ensureLocalFile);
        navigation.popToTop();
      } catch (err) {
        Alert.alert('Saved to Pluck', whatsappErrorMessage(err, pack), [{ text: 'OK', onPress: () => navigation.popToTop() }]);
      }
    } catch (err) {
      setPhase('preview');
      Alert.alert("Couldn't save", err.message);
    }
  };

  const pack = currentPack(stickers);
  const unlocksNow = pack.missing === 1;

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      {phase === 'pick' || phase === 'working' ? (
        <>
          <Text style={[styles.title, { color: t.text }]}>Tap the sticker</Text>
          <Text style={[styles.sub, { color: t.muted }]}>
            {nativeAvailable ? 'Pluck cuts it out for you.' : 'Pluck crops a square around your tap.'}
          </Text>
          <Pressable style={styles.stage} onPress={onTap} onLayout={(e) => setBox(e.nativeEvent.layout)} disabled={phase === 'working'}>
            <Image
              source={{ uri }}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              onLoad={(e) => setNatural({ width: e.source.width, height: e.source.height })}
            />
            {phase === 'working' && (
              <View style={styles.scrim}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.scrimText}>Snip snip…</Text>
              </View>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={[styles.title, { color: t.text }]}>{result.method === 'lift' ? 'Got it ✂️' : 'Close enough?'}</Text>
          {hint && <Text style={[styles.sub, { color: t.muted }]}>{hint}</Text>}
          <View style={[styles.preview, { borderColor: t.border }]}>
            <Checkerboard />
            <Image source={{ uri: result.uri }} style={styles.previewImg} contentFit="contain" />
          </View>

          <Pressable
            onPress={() => save({ thenWhatsApp: pack.missing <= 1 })}
            disabled={phase === 'saving'}
            style={[styles.primary, { backgroundColor: t.accent }]}
          >
            <Text style={[styles.primaryText, { color: t.accentText }]}>
              {phase === 'saving' ? 'Saving…' : pack.missing > 1 ? 'Save to Pluck' : unlocksNow ? 'Save + unlock WhatsApp pack 🎉' : 'Save + send to WhatsApp'}
            </Text>
          </Pressable>
          {pack.missing > 1 && (
            <Text style={[styles.sub, { color: t.muted, textAlign: 'center' }]}>
              {pack.missing - 1} more after this and your WhatsApp pack unlocks.
            </Text>
          )}
          <View style={styles.row}>
            {pack.missing <= 1 && (
              <Pressable onPress={() => save({ thenWhatsApp: false })} style={[styles.ghost, { borderColor: t.accent }]}>
                <Text style={{ color: t.accent, fontWeight: '700' }}>Just save</Text>
              </Pressable>
            )}
            <Pressable onPress={() => setPhase('pick')} style={[styles.ghost, { borderColor: t.accent }]}>
              <Text style={{ color: t.accent, fontWeight: '700' }}>Try again</Text>
            </Pressable>
            {result.method === 'lift' && (
              <Pressable
                onPress={async () => {
                  setResult({ uri: await squareCrop(result.point), method: 'square', point: result.point });
                  setHint('Square crop instead.');
                }}
                style={[styles.ghost, { borderColor: t.accent }]}
              >
                <Text style={{ color: t.accent, fontWeight: '700' }}>Square crop</Text>
              </Pressable>
            )}
          </View>
        </>
      )}
    </View>
  );
}

function Checkerboard() {
  const cells = [];
  for (let r = 0; r < 12; r++) for (let c = 0; c < 12; c++) {
    cells.push(<View key={`${r}-${c}`} style={{ width: `${100 / 12}%`, height: `${100 / 12}%`, backgroundColor: (r + c) % 2 ? '#E9E4EE' : '#FFFFFF' }} />);
  }
  return <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', flexWrap: 'wrap' }]}>{cells}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  sub: { fontSize: 14, lineHeight: 20 },
  stage: { flex: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: '#00000010' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0006', alignItems: 'center', justifyContent: 'center', gap: 10 },
  scrimText: { color: '#fff', fontWeight: '700' },
  preview: { aspectRatio: 1, width: '100%', borderRadius: 24, overflow: 'hidden', borderWidth: 1, marginVertical: 8 },
  previewImg: { ...StyleSheet.absoluteFillObject, margin: 24 },
  primary: { borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  primaryText: { fontWeight: '800', fontSize: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  ghost: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
});
