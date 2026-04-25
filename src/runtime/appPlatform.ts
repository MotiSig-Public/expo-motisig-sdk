import type { AppPlatform } from '../types';

export function getAppPlatform(): AppPlatform {
  // Defer loading `react-native` until after the native runtime is ready (New Architecture / bridgeless).
  const { Platform } = require('react-native') as typeof import('react-native');
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'web') return 'web';
  return 'android';
}
