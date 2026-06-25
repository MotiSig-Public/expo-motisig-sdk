import type { ConfigPlugin } from '@expo/config-plugins';

export interface MotiSigNsePluginProps {
  /** Enable iOS Notification Service Extension setup. Defaults to false (no-op). */
  enabled?: boolean;
  /** APS environment: 'development' or 'production'. Defaults to 'production'. */
  mode?: 'development' | 'production';
  /** Apple Developer Team ID for signing the NSE target. */
  devTeam?: string;
  /** iPhone deployment target for the NSE target. */
  iPhoneDeploymentTarget?: string;
  /**
   * Path (absolute or relative to project root) to a custom NotificationService.m.
   * Defaults to the bundled implementation that handles _motisig.imageUrl,
   * _richContent.image, and fcm_options.image.
   */
  iosNSEFilePath?: string;
  /**
   * Remove com.apple.security.application-groups from the main app + NSE entitlements.
   * Enable this when your Apple Developer account/profile does not allow App Groups
   * (the underlying expo-notification-service-extension-plugin always adds them). 
   * Defaults to false.
   */
  stripAppGroups?: boolean;
}

export interface MotiSigPluginProps {
  nse?: MotiSigNsePluginProps;
}

declare const withMotiSig: ConfigPlugin<MotiSigPluginProps>;
export default withMotiSig;
