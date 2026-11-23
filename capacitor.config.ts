import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'id.kasmini.pos',
  appName: 'KASIR',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: { allowMixedContent: false, adjustMarginsForEdgeToEdge: 'force' }
};
export default config;
