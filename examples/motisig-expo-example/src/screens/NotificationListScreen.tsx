import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { MotiSig } from '@motisig/expo-motisig-sdk';
import type { RootStackParamList } from '../navigation/types';
import { useNotificationsInbox } from '../notifications/NotificationsContext';
import { formatNotificationReceivedLabel } from '../notifications/formatNotificationReceivedLabel';
import type { NotificationListItem } from '../notifications/notificationModel';

type MotiSigHandle = InstanceType<typeof MotiSig>;

type Nav = NativeStackNavigationProp<RootStackParamList, 'NotificationsList'>;

type ScreenProps = NativeStackScreenProps<RootStackParamList, 'NotificationsList'> & {
  motiSig: MotiSigHandle;
  sdkReady: boolean;
};

function rowIcon(item: NotificationListItem): { name: keyof typeof Ionicons.glyphMap; color: string } {
  if (item.receivedInForeground) {
    return { name: 'notifications', color: '#007AFF' };
  }
  if (item.sourcedFromDeliveredCenter) {
    return { name: 'file-tray-full', color: '#8E8E93' };
  }
  return { name: 'hand-left', color: '#FF9500' };
}

function NotificationRow({
  item,
  onPress,
  now,
}: {
  item: NotificationListItem;
  onPress: () => void;
  now: Date;
}) {
  const icon = rowIcon(item);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <Ionicons name={icon.name} size={22} color={icon.color} style={styles.rowIcon} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.title ?? 'No title'}
        </Text>
        {item.body ? (
          <Text style={styles.rowBody} numberOfLines={2}>
            {item.body}
          </Text>
        ) : null}
        <Text style={styles.rowCaption}>
          {formatNotificationReceivedLabel(item.receivedAt, now)}
        </Text>
      </View>
    </Pressable>
  );
}

export function NotificationListScreen({ motiSig, sdkReady }: ScreenProps) {
  const navigation = useNavigation<Nav>();
  const { notifications, mergeDeliveredFromSystem } = useNotificationsInbox();
  const [now, setNow] = useState(() => new Date());
  const [motiSigPushEnabled, setMotiSigPushEnabled] = useState(() => motiSig.isNotificationEnabled);

  useEffect(() => {
    if (!sdkReady) return;
    setMotiSigPushEnabled(motiSig.isNotificationEnabled);
  }, [sdkReady, motiSig]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void mergeDeliveredFromSystem();
    }, [mergeDeliveredFromSystem]),
  );

  const renderItem: ListRenderItem<NotificationListItem> = useCallback(
    ({ item }) => (
      <NotificationRow
        item={item}
        now={now}
        onPress={() => navigation.navigate('NotificationDetail', { notificationId: item.id })}
      />
    ),
    [navigation, now],
  );

  const onMotiSigPushToggle = useCallback(
    (value: boolean) => {
      setMotiSigPushEnabled(value);
      void motiSig.setNotificationEnabled(value).catch(() => {
        console.warn('[MotiSigExample] setNotificationEnabled failed');
      });
    },
    [motiSig],
  );

  const pushRow = (
    <View style={styles.pushRow}>
      <Text style={styles.pushRowLabel}>MotiSig push</Text>
      <Switch
        value={motiSigPushEnabled}
        onValueChange={onMotiSigPushToggle}
        disabled={!sdkReady}
      />
    </View>
  );

  if (notifications.length === 0) {
    return (
      <View style={styles.column}>
        {pushRow}
        <View style={styles.empty}>
          <Ionicons name="notifications-off-outline" size={48} color="#C7C7CC" style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>No Notifications Yet</Text>
          <Text style={styles.emptySubtitle}>
            Push notifications received by the app will appear here.
          </Text>
          <Text style={styles.emptyHint}>
            MotiSig toggle: server delivery (not OS notification permission).
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.column}>
      {pushRow}
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    flex: 1,
  },
  pushRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  pushRowLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowIcon: {
    width: 28,
    marginTop: 2,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  rowBody: {
    fontSize: 15,
    color: '#666',
    marginTop: 4,
  },
  rowCaption: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 8,
  },
});
