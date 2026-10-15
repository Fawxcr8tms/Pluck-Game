import { useEffect } from 'react';
import { AppState } from 'react-native';
import PluckNative from '../../modules/pluck-native';

/**
 * Back Tap: double-tap the back of the iPhone -> Shortcuts takes a screenshot -> "Cut Sticker with Pluck"
 * hands it to the app. Here we pick it up and open the cut-out screen in instant mode.
 */
export function useBackTapCapture(navigationRef, navReady) {
  useEffect(() => {
    if (!PluckNative || !navReady) return;
    const check = () => {
      const uri = PluckNative.takePendingCapture();
      if (uri) navigationRef.navigate('Cutout', { uri, instant: true });
    };
    check();
    const app = AppState.addEventListener('change', (s) => s === 'active' && check());
    const sub = PluckNative.addListener?.('onPendingCapture', check);
    return () => {
      app.remove();
      sub?.remove();
    };
  }, [navigationRef, navReady]);
}
