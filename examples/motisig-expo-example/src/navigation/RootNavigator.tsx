import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MotiSig } from '@motisig/expo-motisig-sdk';
import type { RootStackParamList } from './types';
import { NotificationDetailScreen } from '../screens/NotificationDetailScreen';
import { NotificationListScreen } from '../screens/NotificationListScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

type MotiSigHandle = InstanceType<typeof MotiSig>;

export function RootNavigator({
  motiSig,
  sdkReady,
}: {
  motiSig: MotiSigHandle;
  sdkReady: boolean;
}) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="NotificationsList" options={{ title: 'Notifications' }}>
        {(props) => (
          <NotificationListScreen {...props} motiSig={motiSig} sdkReady={sdkReady} />
        )}
      </Stack.Screen>
      <Stack.Screen
        name="NotificationDetail"
        component={NotificationDetailScreen}
        options={{
          title: 'Notification',
          headerBackTitle: 'Notifications',
        }}
      />
    </Stack.Navigator>
  );
}
