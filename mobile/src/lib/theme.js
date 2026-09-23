import { useColorScheme } from 'react-native';

const light = { bg: '#FFF8F1', card: '#FFFFFF', text: '#1D1B20', muted: '#6E6A73', accent: '#FF5A5F', accentText: '#FFFFFF', border: '#EDE4DA', chip: '#F3EAE0' };
const dark = { bg: '#141217', card: '#1F1C23', text: '#F4EFF6', muted: '#A39EAA', accent: '#FF7A7E', accentText: '#1D1B20', border: '#2E2A33', chip: '#2A2630' };

export function useTheme() {
  return useColorScheme() === 'dark' ? dark : light;
}

export const PLATFORM_LABEL = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  reddit: 'Reddit',
  web: 'Web',
  manual: 'Captured',
};
