/**
 * Optional native module loaders — used so the app can bundle for web/PWA
 * even when a native-only package is in dependencies (feature-gated).
 */
export interface OptionalModule { [k: string]: any }

export const Haptics: OptionalModule | undefined = (() => {
  try { return require('expo-haptics'); } catch { return undefined; }
})();
export const BarcodeGenerator: OptionalModule | undefined = (() => {
  try { return require('expo-barcode-generator'); } catch { return undefined; }
})();
export const FileSystem: OptionalModule | undefined = (() => {
  try { return require('expo-file-system'); } catch { return undefined; }
})();
export const Sharing: OptionalModule | undefined = (() => {
  try { return require('expo-sharing'); } catch { return undefined; }
})();
export const Notifications: OptionalModule | undefined = (() => {
  try { return require('expo-notifications'); } catch { return undefined; }
})();
export const MediaLibrary: OptionalModule | undefined = (() => {
  try { return require('expo-media-library'); } catch { return undefined; }
})();
