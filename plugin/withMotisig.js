const path = require('path');
const fs = require('fs');
const { withEntitlementsPlist, withDangerousMod } = require('@expo/config-plugins');
const withNSE = require('expo-notification-service-extension-plugin').default;

const APP_GROUPS_KEY = 'com.apple.security.application-groups';
const NSE_TARGET = 'NotificationServiceExtension';
const DEFAULT_NSE_FILE = path.join(
  __dirname,
  '..',
  'native',
  'ios',
  'NotificationService',
  'NotificationService.m'
);

function warnIfMissingEasProjectId(config) {
  const projectId = config.extra?.eas?.projectId;
  if (!projectId || (typeof projectId === 'string' && projectId.trim() === '')) {
    console.warn(
      '[@motisig/expo-motisig-sdk] Missing `extra.eas.projectId` in app config. Expo push tokens from getExpoPushTokenAsync require an EAS project ID. See https://docs.expo.dev/push-notifications/push-notifications-setup/'
    );
  }
}

const stripAppGroupsFromMainApp = (config) =>
  withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults[APP_GROUPS_KEY];
    return cfg;
  });

const stripAppGroupsFromNse = (config) =>
  withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const file = path.join(
        cfg.modRequest.platformProjectRoot,
        NSE_TARGET,
        `${NSE_TARGET}.entitlements`
      );
      if (!fs.existsSync(file)) return cfg;
      const xml = fs.readFileSync(file, 'utf8');
      const stripped = xml.replace(
        /\s*<key>com\.apple\.security\.application-groups<\/key>\s*<array>[\s\S]*?<\/array>/,
        ''
      );
      fs.writeFileSync(file, stripped);
      return cfg;
    },
  ]);

/**
 * @type {import('expo/config-plugins').ConfigPlugin<import('./withMotisig').MotiSigPluginProps>}
 */
function withMotiSig(config, props = {}) {
  warnIfMissingEasProjectId(config);

  const nse = props.nse;
  if (!nse?.enabled) return config;

  const mode = nse.mode ?? 'production';
  const iosNSEFilePath = nse.iosNSEFilePath
    ? path.resolve(nse.iosNSEFilePath)
    : DEFAULT_NSE_FILE;

  // Order: when stripAppGroups is on, compose strip first so NSE runs *outer*
  // (adds the App Group entitlement first), then the inner strip removes it.
  // withMod runs outer-action first, then nextMod.
  let next = config;
  if (nse.stripAppGroups) {
    next = stripAppGroupsFromNse(stripAppGroupsFromMainApp(next));
  }
  next = withNSE(next, {
    mode,
    iosNSEFilePath,
    devTeam: nse.devTeam,
    iPhoneDeploymentTarget: nse.iPhoneDeploymentTarget,
  });
  return next;
}

module.exports = withMotiSig;
module.exports.default = withMotiSig;
