import { StyleSheet, Text, View } from 'react-native';

export function EnvMissingScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Configuration</Text>
      <Text style={styles.body}>
        Set EXPO_PUBLIC_MOTISIG_SDK_KEY and EXPO_PUBLIC_MOTISIG_PROJECT_ID (see README). Use a
        development build on a device and set extra.eas.projectId in app.json for Expo push.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    color: '#555',
    lineHeight: 22,
  },
});
