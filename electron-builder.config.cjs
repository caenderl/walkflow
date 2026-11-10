// electron-builder configuration.
// Signing: without a certificate macOS is signed ad hoc ("-"), Windows/Linux stay unsigned.
// For Developer ID + notarization later, only set these environment variables in GitHub Actions:
//   CSC_LINK, CSC_KEY_PASSWORD (certificate), APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
const signedMac = !!process.env.CSC_LINK && !!process.env.APPLE_TEAM_ID;
// Updates (electron-updater, electron/main.ts): the app looks at the GitHub releases of the repository the build was made for.
// "latest*.yml" and the ".blockmap" files next to the installers tell it what is new and which parts it can skip; the release
// workflow attaches them. Windows and the Linux AppImage update themselves. macOS only does with a signed app, and then needs
// the zip beside the dmg (the dmg is for the first install, the zip for updates).
const [repoOwner, repoName] = (process.env.GITHUB_REPOSITORY ?? '').split('/');

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
  publish: repoOwner && repoName ? [{ provider: 'github', owner: repoOwner, repo: repoName }] : null,
  // Hardening of the Electron binary
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
  },
  // Route packages (.walkflow): the icon in build/file-icon.{icns,ico} (scripts/make-icons.mjs), and a double click opens
  // the file in the app (electron/main.ts)
  fileAssociations: [
    { ext: 'walkflow', name: 'Walkflow route package', description: 'Walkflow route package', icon: 'file-icon', role: 'Editor' },
  ],
  mac: {
    category: 'public.app-category.healthcare-fitness',
    target: signedMac
      ? [{ target: 'dmg', arch: ['arm64', 'x64'] }, { target: 'zip', arch: ['arm64', 'x64'] }]
      : [{ target: 'dmg', arch: ['arm64', 'x64'] }],
    // Apple Silicon refuses to start completely unsigned apps ("damaged"); ad hoc is enough for "Open Anyway"
    identity: signedMac ? undefined : '-',
    hardenedRuntime: signedMac,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: signedMac,
    extendInfo: {
      NSBluetoothAlwaysUsageDescription: bluetoothUsage,
      NSBluetoothPeripheralUsageDescription: bluetoothUsage,
      // The file type itself, so Finder knows the extension and shows its icon whether or not Walkflow is running
      UTExportedTypeDeclarations: [{
        UTTypeIdentifier: 'app.walkflow.route-package',
        UTTypeDescription: 'Walkflow route package',
        UTTypeConformsTo: ['public.json', 'public.data'],
        UTTypeIconFile: 'file-icon.icns',
        UTTypeTagSpecification: { 'public.filename-extension': ['walkflow'] },
      }],
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
