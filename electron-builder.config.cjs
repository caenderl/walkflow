// electron-builder configuration.
// Signing: without a certificate macOS is signed ad hoc ("-"), Windows/Linux stay unsigned.
// For Developer ID + notarization later, only set these environment variables in GitHub Actions:
//   CSC_LINK, CSC_KEY_PASSWORD (certificate), APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
const signedMac = !!process.env.CSC_LINK && !!process.env.APPLE_TEAM_ID;

// English base text; translations in build/lproj/<lang>.lproj/InfoPlist.strings
const bluetoothUsage = 'Walkflow connects to your treadmill via Bluetooth to control it and show live data.';

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'app.walkflow.desktop',
  productName: 'Walkflow',
  copyright: 'Copyright © 2026 Walkflow contributors (MIT)',
  directories: { output: 'release', buildResources: 'build' },
  files: ['dist-desktop/**', 'dist-electron/**', 'package.json'],
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
  publish: null,
  // Hardening of the Electron binary
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
  },
  mac: {
    category: 'public.app-category.healthcare-fitness',
    target: [{ target: 'dmg', arch: ['arm64', 'x64'] }],
    // Apple Silicon refuses to start completely unsigned apps ("damaged"); ad hoc is enough for "Open Anyway"
    identity: signedMac ? undefined : '-',
    hardenedRuntime: signedMac,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: signedMac,
    extendInfo: {
      NSBluetoothAlwaysUsageDescription: bluetoothUsage,
      NSBluetoothPeripheralUsageDescription: bluetoothUsage,
    },
    // Localized usage texts for the macOS Bluetooth prompt (Contents/Resources/<lang>.lproj/InfoPlist.strings)
    extraResources: [{ from: 'build/lproj', to: '.', filter: ['*.lproj/InfoPlist.strings'] }],
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
  },
  linux: {
    target: [{ target: 'AppImage', arch: ['x64'] }],
    category: 'Utility',
  },
};
