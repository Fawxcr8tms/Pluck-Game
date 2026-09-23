import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { findUrl } from '../lib/links';

/**
 * "You copied a link. Pluck it?"
 * We only *check* whether the clipboard has a URL when the app comes to the foreground. That check
 * doesn't trigger iOS's "Pluck pasted from ..." banner. We *read* it only when the user taps the banner.
 */
export function useClipboardLink() {
  const [hasLink, setHasLink] = useState(false);
  const dismissed = useRef(false);

  const check = useCallback(async () => {
    if (dismissed.current) return;
    try {
      setHasLink(Platform.OS === 'ios' ? await Clipboard.hasUrlAsync() : await Clipboard.hasStringAsync());
    } catch {
      setHasLink(false);
    }
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        dismissed.current = false;
        check();
      }
    });
    return () => sub.remove();
  }, [check]);

  /** Reads the clipboard (user-initiated). Returns a social URL or null. */
  const takeLink = useCallback(async () => {
    const text = (Platform.OS === 'ios' ? await Clipboard.getUrlAsync() : null) ?? (await Clipboard.getStringAsync());
    setHasLink(false);
    const url = findUrl(text);
    return url;
  }, []);

  const dismiss = useCallback(() => {
    dismissed.current = true;
    setHasLink(false);
  }, []);

  return { hasLink, takeLink, dismiss };
}
