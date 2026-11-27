# KASIR DBL 1.2.1 - audit continuation

- Replaced Android launcher mipmap assets and adaptive foreground artwork with the supplied cash-register logo (`Logo aplikasi kasir.png`).
- Added a GitHub Actions step to explicitly copy branded launcher resources after Capacitor sync and set native label to KASIR.
- Updated `android-actions/setup-android` to v4.
- Added independent expense master type and item management (PIN protected) and dropdown selection in the expense entry dialog.
- Preserved existing settings record when saving shop settings, including PIN and expense master data.

Validation performed: JavaScript syntax checks (`node --check app.js`, `node --check db.js`) and Python syntax check for manifest patch. Local Vite build was not confirmed because npm installation timed out in this environment. Android APK build and physical device tests remain pending GitHub Actions.
