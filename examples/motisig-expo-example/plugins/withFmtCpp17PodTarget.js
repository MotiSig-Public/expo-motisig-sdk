/**
 * Xcode 26.4+ Apple Clang: fmt 11 FMT_STRING / consteval fails under C++20.
 * Compiling the fmt pod target as gnu++17 makes fmt pick FMT_USE_CONSTEVAL 0.
 * No-op when using RN prebuilts (no fmt target).
 *
 * @type {import('expo/config-plugins').ConfigPlugin<void>}
 */
const { withPodfile } = require('expo/config-plugins');

function withFmtCpp17PodTarget(config) {
  return withPodfile(config, (cfg) => {
    let contents = cfg.modResults.contents;
    const marker = '# @motisig: fmt pod C++17 (Xcode 26 / consteval)';
    if (contents.includes(marker)) {
      return cfg;
    }

    const anchor =
      ':ccache_enabled => ccache_enabled?(podfile_properties),\n    )';
    if (!contents.includes(anchor)) {
      return cfg;
    }

    const block = `
    ${marker}
    installer.pods_project.targets.each do |target|
      next unless target.name == 'fmt'
      target.build_configurations.each do |bc|
        bc.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'gnu++17'
      end
    end`;

    contents = contents.replace(anchor, `${anchor}${block}`);

    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = withFmtCpp17PodTarget;
