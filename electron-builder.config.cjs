// electron-builder-Konfiguration.
// Signierung: Ohne Zertifikat wird macOS ad-hoc signiert ("-"), Windows/Linux bleiben unsigniert.
// Für Developer ID + Notarisierung später nur die Umgebungsvariablen in GitHub Actions setzen:
//   CSC_LINK, CSC_KEY_PASSWORD (Zertifikat), APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
const signedMac = !!process.env.CSC_LINK && !!process.env.APPLE_TEAM_ID;

const bluetoothUsage = 'Walkflow verbindet sich per Bluetooth mit deinem Laufband, um es zu steuern und Live-Daten anzuzeigen.';

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'app.walkflow.desktop',
  productName: 'Walkflow',
  copyright: 'Copyright © 2026 Walkflow contributors (MIT)',
  directories: { output: 'release', buildResources: 'build' },
  files: ['dist-desktop/**', 'dist-electron/**', 'package.json'],
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
  publish: null,
  // Härtung des Electron-Binaries
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
    // Apple Silicon startet komplett unsignierte Apps nicht ("beschädigt"), ad-hoc reicht für "Trotzdem öffnen"
    identity: signedMac ? undefined : '-',
    hardenedRuntime: signedMac,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: signedMac,
    extendInfo: {
      NSBluetoothAlwaysUsageDescription: bluetoothUsage,
      NSBluetoothPeripheralUsageDescription: bluetoothUsage,
    },
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
