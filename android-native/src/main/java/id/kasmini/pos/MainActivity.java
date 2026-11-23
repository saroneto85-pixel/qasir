package id.kasmini.pos;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
    @Override public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(BluetoothSerialPlugin.class);
        registerPlugin(PhoneContactsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
