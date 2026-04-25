import { useLayoutEffect, type ReactNode } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from '../navigation/types';
import { useNotificationsInbox } from '../notifications/NotificationsContext';
import { extractPushImageUrl } from '../notifications/extractPushImageUrl';
import type { NotificationListItem } from '../notifications/notificationModel';

type DetailRoute = RouteProp<RootStackParamList, 'NotificationDetail'>;
type DetailNav = NativeStackNavigationProp<RootStackParamList, 'NotificationDetail'>;

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return 'nil';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return String(v);
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function deliveryLabel(item: NotificationListItem): {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
} {
  if (item.receivedInForeground) {
    return { label: 'Foreground', icon: 'notifications', color: '#007AFF' };
  }
  if (item.sourcedFromDeliveredCenter) {
    return { label: 'Notification Center', icon: 'file-tray-full', color: '#8E8E93' };
  }
  return { label: 'User Tap', icon: 'hand-left', color: '#FF9500' };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function LabeledRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.labeledRow}>
      <Text style={styles.labeledLabel}>{label}</Text>
      <Text style={styles.labeledValue}>{value}</Text>
    </View>
  );
}

export function NotificationDetailScreen() {
  const navigation = useNavigation<DetailNav>();
  const route = useRoute<DetailRoute>();
  const { getById } = useNotificationsInbox();
  const item = getById(route.params.notificationId);
  const del = item ? deliveryLabel(item) : null;

  useLayoutEffect(() => {
    navigation.setOptions({ title: item?.title ?? 'Notification' });
  }, [navigation, item?.title]);

  if (!item) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>Notification not found.</Text>
      </View>
    );
  }

  const keys = Object.keys(item.userInfo).sort();
  const imageUri = extractPushImageUrl(item.userInfo);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      {imageUri ? (
        <Section title="Image">
          <Image source={{ uri: imageUri }} style={styles.pushImage} resizeMode="contain" accessibilityLabel="Push notification image" />
        </Section>
      ) : null}

      <Section title="Message">
        <LabeledRow label="Title" value={item.title ?? '—'} />
        {item.body ? (
          <View style={styles.bodyBlock}>
            <Text style={styles.bodyLabel}>Body</Text>
            <Text style={styles.bodyText}>{item.body}</Text>
          </View>
        ) : null}
      </Section>

      <Section title="Metadata">
        <LabeledRow label="Message ID" value={item.messageId ?? '—'} />
        <LabeledRow
          label="Received"
          value={item.receivedAt.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })}
        />
        <View style={styles.labeledRow}>
          <Text style={styles.labeledLabel}>Delivery</Text>
          <View style={styles.deliveryRow}>
            <Ionicons name={del!.icon} size={18} color={del!.color} />
            <Text style={[styles.deliveryText, { color: del!.color }]}>{del!.label}</Text>
          </View>
        </View>
      </Section>

      {keys.length > 0 ? (
        <Section title="Raw Payload">
          {keys.map((key) => (
            <LabeledRow key={key} label={key} value={formatValue(item.userInfo[key])} />
          ))}
        </Section>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  labeledRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  labeledLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 4,
  },
  labeledValue: {
    fontSize: 17,
    color: '#000',
  },
  bodyBlock: {
    paddingVertical: 8,
  },
  bodyLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 4,
  },
  bodyText: {
    fontSize: 17,
    color: '#000',
  },
  deliveryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deliveryText: {
    fontSize: 17,
    fontWeight: '500',
  },
  missing: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  missingText: {
    fontSize: 16,
    color: '#666',
  },
  pushImage: {
    width: '100%',
    maxHeight: 240,
    minHeight: 120,
    backgroundColor: '#E5E5EA',
    borderRadius: 8,
  },
});
