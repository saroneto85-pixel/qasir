package id.kasmini.pos;
import com.getcapacitor.BridgeActivity;
import id.kasmini.pos.sync.LanSyncPlugin;
import id.kasmini.pos.license.LicensePlugin;
public class MainActivity extends BridgeActivity {
    @Override public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(BluetoothSerialPlugin.class);
        registerPlugin(PhoneContactsPlugin.class);
        registerPlugin(LanSyncPlugin.class);
        registerPlugin(LicensePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
