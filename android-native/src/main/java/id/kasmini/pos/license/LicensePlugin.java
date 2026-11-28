package id.kasmini.pos.license;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Jembatan JavaScript <-> lisensi native. Pemeriksaan tanda tangan kode aktivasi terjadi di sini, bukan di JS. */
@CapacitorPlugin(name = "License")
public class LicensePlugin extends Plugin {

    private JSObject status() {
        JSObject o = new JSObject();
        LicenseCodec.Info i = LicenseStore.info(getContext());
        o.put("deviceCode", LicenseStore.deviceCode(getContext()));
        o.put("configured", LicenseStore.configured());
        o.put("genuine", LicenseStore.signatureOk(getContext()));
        o.put("valid", i != null);
        if (i != null) {
            o.put("plan", i.plan);
            o.put("planName", i.planName());
            o.put("extraDevices", i.extraDevices());
            o.put("issuedEpochDay", i.epochDay());
        }
        return o;
    }

    @PluginMethod
    public void status(PluginCall call) {
        try { call.resolve(status()); } catch (Exception e) { call.reject("Gagal membaca lisensi: " + e.getMessage()); }
    }

    @PluginMethod
    public void activate(PluginCall call) {
        String code = call.getString("code", "");
        try {
            LicenseStore.activate(getContext(), code);
            call.resolve(status());
        } catch (IllegalArgumentException e) {
            call.reject(e.getMessage());
        } catch (Exception e) {
            call.reject("Aktivasi gagal: " + e.getMessage());
        }
    }
}
