package id.kasmini.pos;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.os.Build;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import org.json.*;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(name = "BluetoothSerial", permissions = {
 @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT })
})
public class BluetoothSerialPlugin extends Plugin {
 private BluetoothSocket socket;
 private OutputStream output;
 private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
 private BluetoothAdapter adapter() { return BluetoothAdapter.getDefaultAdapter(); }
 @PluginMethod public void listPairedDevices(PluginCall call) {
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && getPermissionState("bluetooth") != PermissionState.GRANTED) { requestPermissionForAlias("bluetooth", call, "bluetoothPermsCallback"); return; }
  try { BluetoothAdapter a=adapter(); if(a==null){call.reject("Bluetooth tidak didukung");return;} JSArray arr=new JSArray(); Set<BluetoothDevice> paired=a.getBondedDevices(); for(BluetoothDevice d:paired){JSObject o=new JSObject();o.put("name",d.getName());o.put("address",d.getAddress());arr.put(o);} JSObject ret=new JSObject();ret.put("devices",arr);call.resolve(ret); } catch(Exception e){call.reject("Gagal membaca perangkat: "+e.getMessage(),e);}
 }
 @PermissionCallback private void bluetoothPermsCallback(PluginCall call){if(getPermissionState("bluetooth")==PermissionState.GRANTED)listPairedDevices(call);else call.reject("Izin Bluetooth ditolak");}
 @PluginMethod public void connect(PluginCall call){String address=call.getString("address");if(address==null){call.reject("Alamat printer wajib diisi");return;}if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.S&&getPermissionState("bluetooth")!=PermissionState.GRANTED){requestPermissionForAlias("bluetooth",call,"connectPermsCallback");return;}connectDevice(call,address);}
 @PermissionCallback private void connectPermsCallback(PluginCall call){String address=call.getString("address");if(getPermissionState("bluetooth")==PermissionState.GRANTED)connectDevice(call,address);else call.reject("Izin Bluetooth ditolak");}
 private void connectDevice(PluginCall call,String address){new Thread(()->{try{BluetoothDevice d=adapter().getRemoteDevice(address);BluetoothSocket s=d.createRfcommSocketToServiceRecord(SPP);s.connect();socket=s;output=s.getOutputStream();JSObject r=new JSObject();r.put("connected",true);r.put("name",d.getName());call.resolve(r);}catch(Exception e){call.reject("Koneksi printer gagal: "+e.getMessage(),e);}}).start();}
 @PluginMethod public void print(PluginCall call){String data=call.getString("data");if(data==null||output==null){call.reject("Printer belum terhubung atau data kosong");return;}try{byte[] bytes=android.util.Base64.decode(data,android.util.Base64.DEFAULT);OutputStream stream=output;new Thread(()->{try{stream.write(bytes);stream.flush();call.resolve();}catch(Exception e){call.reject("Gagal mengirim data cetak: "+e.getMessage(),e);}}).start();}catch(Exception e){call.reject("Gagal menyiapkan data cetak: "+e.getMessage(),e);}}
 @PluginMethod public void disconnect(PluginCall call){try{if(output!=null)output.close();if(socket!=null)socket.close();output=null;socket=null;call.resolve();}catch(Exception e){call.reject(e.getMessage(),e);}}
}
