import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { findUrl } from './src/lib/links';
import ImportScreen from './src/screens/ImportScreen';
import StickerDetailScreen from './src/screens/StickerDetailScreen';
import VaultScreen from './src/screens/VaultScreen';
import { VaultProvider } from './src/state/VaultContext';
import { navigationRef } from './src/navigation';

const Stack = createNativeStackNavigator();

/** Share-sheet entry point: a link goes to Import and gets plucked, images get saved as manual captures. */
function ShareIntentRouter({ navReady }) {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  useEffect(() => {
    if (!hasShareIntent || !navReady) return; // cold start: wait for the navigator, then run
    const url = shareIntent.webUrl ?? findUrl(shareIntent.text);
    const images = (shareIntent.files ?? []).filter((f) => f.mimeType?.startsWith('image/'));
    if (images.length) navigationRef.navigate('Import', { sharedFiles: images });
    else if (url) navigationRef.navigate('Import', { url });
    resetShareIntent();
  }, [hasShareIntent, shareIntent, resetShareIntent, navReady]);

  return null;
}

export default function App() {
  const scheme = useColorScheme();
  const [navReady, setNavReady] = useState(false);
  return (
    <ShareIntentProvider options={{ resetOnBackground: true }}>
      <SafeAreaProvider>
        <VaultProvider>
          <NavigationContainer ref={navigationRef} theme={scheme === 'dark' ? DarkTheme : DefaultTheme} onReady={() => setNavReady(true)}>
            <ShareIntentRouter navReady={navReady} />
            <Stack.Navigator>
              <Stack.Screen name="Vault" component={VaultScreen} options={{ headerShown: false }} />
              <Stack.Screen name="Import" component={ImportScreen} options={{ presentation: 'modal', title: 'Pluck stickers' }} />
              <Stack.Screen name="StickerDetail" component={StickerDetailScreen} options={{ title: '' }} />
            </Stack.Navigator>
          </NavigationContainer>
          <StatusBar style="auto" />
        </VaultProvider>
      </SafeAreaProvider>
    </ShareIntentProvider>
  );
}
