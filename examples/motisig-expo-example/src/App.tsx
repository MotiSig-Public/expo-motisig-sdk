import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MotiSig } from '@motisig/expo-motisig-sdk';
import { DEMO_USER_ID, hasEnv, PROJECT_ID, SDK_KEY } from './constants/motiSigConfig';
import { navigationRef } from './navigation/navigationRef';
import { RootNavigator } from './navigation/RootNavigator';
import { NotificationInboxProvider } from './notifications/NotificationsContext';
import { EnvMissingScreen } from './screens/EnvMissingScreen';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  const motiSig = useMemo(() => new MotiSig(), []);
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    if (!hasEnv) {
      console.log('[MotiSigExample] missing env', {
        hasSdkKey: Boolean(SDK_KEY.trim()),
        hasProjectId: Boolean(PROJECT_ID.trim()),
      });
      setSdkReady(false);
      return;
    }
    const baseURL = (process.env.EXPO_PUBLIC_MOTISIG_BASE_URL ?? '').trim();
    console.log('[MotiSigExample] MotiSig config', {
      projectId: PROJECT_ID,
      sdkKey: SDK_KEY,
      baseURL: baseURL.length > 0 ? baseURL : 'default',
      userId: DEMO_USER_ID,
    });
    let cancelled = false;
    (async () => {
      const ok = await motiSig.initialize({
        sdkKey: SDK_KEY,
        projectId: PROJECT_ID,
      });
      if (cancelled) return;
      console.log('[MotiSigExample] MotiSig initialize', { ok });
      if (ok) {
        try {
          console.log('[MotiSigExample] setUser start', { userId: DEMO_USER_ID });
          await motiSig.setUser(DEMO_USER_ID);
          console.log('[MotiSigExample] setUser ok', { currentUserId: motiSig.currentUserId });
          const expoPushToken = await motiSig.getExpoPushToken();
          console.log('[MotiSigExample] Expo push token (sent to MotiSig if non-null)', {
            expoPushToken,
          });
        } catch (err) {
          console.error('[MotiSigExample] setUser failed', err);
          // still show inbox; pushes may be limited without user
        }
      } else {
        console.log('[MotiSigExample] setUser skipped', { reason: 'initialize returned false' });
      }
      if (!cancelled) {
        setSdkReady(ok);
      }
    })();
    return () => {
      cancelled = true;
      motiSig.reset();
    };
  }, [motiSig]);

  if (!hasEnv) {
    return (
      <SafeAreaProvider>
        <View style={styles.root}>
          <EnvMissingScreen />
          <StatusBar style="auto" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <NotificationInboxProvider motiSig={motiSig} sdkReady={sdkReady} navigationRef={navigationRef}>
          <RootNavigator motiSig={motiSig} sdkReady={sdkReady} />
        </NotificationInboxProvider>
      </NavigationContainer>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 56,
    paddingHorizontal: 16,
  },
});
