package id.kasmini.pos;

import android.Manifest;
import android.database.Cursor;
import android.provider.ContactsContract;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;

@CapacitorPlugin(name = "PhoneContacts", permissions = {
    @Permission(alias = "contacts", strings = { Manifest.permission.READ_CONTACTS })
})
public class PhoneContactsPlugin extends Plugin {
    @PluginMethod
    public void getContacts(PluginCall call) {
        if (getPermissionState("contacts") != PermissionState.GRANTED) {
            requestPermissionForAlias("contacts", call, "contactsPermissionCallback");
            return;
        }
        readContacts(call);
    }

    @PermissionCallback
    private void contactsPermissionCallback(PluginCall call) {
        if (getPermissionState("contacts") == PermissionState.GRANTED) readContacts(call);
        else call.reject("Izin membaca kontak ditolak");
    }

    private void readContacts(PluginCall call) {
        JSArray contacts = new JSArray();
        try (Cursor cursor = getContext().getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                new String[]{ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                    ContactsContract.CommonDataKinds.Phone.NUMBER,
                    ContactsContract.CommonDataKinds.Phone.CONTACT_ID},
                null, null, ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " COLLATE NOCASE ASC")) {
            if (cursor != null) {
                int nameCol = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
                int numberCol = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
                int idCol = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.CONTACT_ID);
                while (cursor.moveToNext()) {
                    String name = nameCol >= 0 ? cursor.getString(nameCol) : "";
                    String phone = numberCol >= 0 ? cursor.getString(numberCol) : "";
                    String contactId = idCol >= 0 ? cursor.getString(idCol) : "";
                    if (name == null || name.trim().isEmpty() || phone == null || phone.trim().isEmpty()) continue;
                    JSObject item = new JSObject();
                    item.put("name", name.trim());
                    item.put("phone", phone.trim());
                    item.put("contactId", contactId == null ? "" : contactId);
                    contacts.put(item);
                }
            }
            JSObject result = new JSObject();
            result.put("contacts", contacts);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Gagal membaca kontak HP: " + e.getMessage(), e);
        }
    }
}
