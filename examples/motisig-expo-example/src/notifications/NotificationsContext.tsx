import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { MotiSig, type MotiSigClientEvent } from '@motisig/expo-motisig-sdk';
import type { RootStackParamList } from '../navigation/types';
import {
  mergePresentedIntoList,
  upsertFromListener,
  type NotificationListItem,
} from './notificationModel';
import { logPushIngest } from './pushNotificationDebugLog';

type MotiSigHandle = InstanceType<typeof MotiSig>;

type NotificationsContextValue = {
  notifications: NotificationListItem[];
  getById: (id: string) => NotificationListItem | undefined;
  mergeDeliveredFromSystem: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function useNotificationsInbox(): NotificationsContextValue {
  const v = useContext(NotificationsContext);
  if (!v) {
    throw new Error('useNotificationsInbox must be used within NotificationInboxProvider');
  }
  return v;
}

type Props = {
  children: ReactNode;
  motiSig: MotiSigHandle;
  sdkReady: boolean;
  navigationRef: NavigationContainerRefWithCurrent<RootStackParamList>;
};

export function NotificationInboxProvider({ children, motiSig, sdkReady, navigationRef }: Props) {
  const [notifications, setNotifications] = useState<NotificationListItem[]>([]);

  const mergeDeliveredFromSystem = useCallback(async () => {
    try {
      const presented = await Notifications.getPresentedNotificationsAsync();
      setNotifications((prev) => mergePresentedIntoList(prev, presented));
    } catch {
      // ignore
    }
  }, []);

  const getById = useCallback(
    (id: string) => notifications.find((n) => n.id === id),
    [notifications],
  );

  useEffect(() => {
    if (!sdkReady) return;
    void mergeDeliveredFromSystem();
  }, [sdkReady, mergeDeliveredFromSystem]);

  useEffect(() => {
    if (!sdkReady) return;
    const onChange = (s: AppStateStatus) => {
      if (s === 'active') void mergeDeliveredFromSystem();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [sdkReady, mergeDeliveredFromSystem]);

  useEffect(() => {
    if (!sdkReady) return;
    let cancelled = false;
    (async () => {
      try {
        const last = await Notifications.getLastNotificationResponseAsync();
        if (cancelled || !last?.notification) return;
        setNotifications((prev) => {
          const { next, item } = upsertFromListener(prev, last.notification, {
            receivedInForeground: false,
            sourcedFromDeliveredCenter: false,
          });
          if (next !== prev) {
            logPushIngest('listener', item, false, last.notification);
          }
          return next;
        });
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sdkReady]);

  useEffect(() => {
    if (!sdkReady) return;
    const unsub = motiSig.addListener((e: MotiSigClientEvent) => {
      if (e.type === 'foreground_notification') {
        setNotifications((prev) => {
          const { next, item } = upsertFromListener(prev, e.notification, {
            receivedInForeground: true,
            sourcedFromDeliveredCenter: false,
          });
          if (next !== prev) {
            logPushIngest('listener', item, true, e.notification);
          }
          return next;
        });
        return;
      }
      if (e.type === 'notification_response') {
        setNotifications((prev) => {
          const { next, item } = upsertFromListener(prev, e.response.notification, {
            receivedInForeground: false,
            sourcedFromDeliveredCenter: false,
          });
          if (next !== prev) {
            logPushIngest('listener', item, false, e.response.notification);
          }
          requestAnimationFrame(() => {
            if (navigationRef.isReady()) {
              navigationRef.navigate('NotificationDetail', { notificationId: item.id });
            }
          });
          return next;
        });
      }
    });
    return unsub;
  }, [sdkReady, motiSig, navigationRef]);

  const value = useMemo(
    () => ({
      notifications,
      getById,
      mergeDeliveredFromSystem,
    }),
    [notifications, getById, mergeDeliveredFromSystem],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
