package id.kasmini.pos.sync;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Parser/penulis JSON kecil tanpa dependensi (sama di Android dan JVM desktop untuk pengujian).
 * Objek -> LinkedHashMap (urutan kunci dipertahankan), array -> ArrayList,
 * angka bulat -> Long, angka pecahan -> Double, null -> null.
 */
public final class MiniJson {
    private MiniJson() {}

    public static Object parse(String text) {
        if (text == null) throw new IllegalArgumentException("JSON kosong");
        Parser p = new Parser(text);
        p.ws();
        Object v = p.value(0);
        p.ws();
        if (p.i != p.s.length()) throw p.err("Karakter berlebih");
        return v;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> parseObject(String text) {
        Object v = parse(text);
        if (!(v instanceof Map)) throw new IllegalArgumentException("JSON harus berupa objek");
        return (Map<String, Object>) v;
    }

    public static String stringify(Object v) {
        StringBuilder sb = new StringBuilder();
        write(sb, v);
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    public static void write(StringBuilder sb, Object v) {
        if (v == null) { sb.append("null"); return; }
        if (v instanceof String) { quote(sb, (String) v); return; }
        if (v instanceof Boolean) { sb.append(((Boolean) v) ? "true" : "false"); return; }
        if (v instanceof Long || v instanceof Integer || v instanceof Short || v instanceof Byte) { sb.append(((Number) v).longValue()); return; }
        if (v instanceof Number) { writeDouble(sb, ((Number) v).doubleValue()); return; }
        if (v instanceof Map) {
            sb.append('{');
            boolean first = true;
            for (Map.Entry<String, Object> e : ((Map<String, Object>) v).entrySet()) {
                if (!first) sb.append(',');
                first = false;
                quote(sb, e.getKey());
                sb.append(':');
                write(sb, e.getValue());
            }
            sb.append('}');
            return;
        }
        if (v instanceof List) {
            sb.append('[');
            boolean first = true;
            for (Object o : (List<Object>) v) {
                if (!first) sb.append(',');
                first = false;
                write(sb, o);
            }
            sb.append(']');
            return;
        }
        quote(sb, String.valueOf(v));
    }

    private static void writeDouble(StringBuilder sb, double d) {
        if (Double.isNaN(d) || Double.isInfinite(d)) { sb.append("null"); return; }
        if (d == Math.rint(d) && Math.abs(d) < 1e15) { sb.append((long) d); return; }
        sb.append(Double.toString(d));
    }

    public static String quote(String s) {
        StringBuilder sb = new StringBuilder(s.length() + 2);
        quote(sb, s);
        return sb.toString();
    }

    public static void quote(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0, n = s.length(); i < n; i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                default:
                    if (c < 0x20 || c == 0x2028 || c == 0x2029) {
                        sb.append("\\u");
                        String h = Integer.toHexString(c);
                        for (int k = h.length(); k < 4; k++) sb.append('0');
                        sb.append(h);
                    } else sb.append(c);
            }
        }
        sb.append('"');
    }

    private static final class Parser {
        final String s;
        int i = 0;
        Parser(String s) { this.s = s; }

        IllegalArgumentException err(String m) { return new IllegalArgumentException(m + " pada posisi " + i); }

        void ws() {
            while (i < s.length()) {
                char c = s.charAt(i);
                if (c == ' ' || c == '\n' || c == '\r' || c == '\t') i++; else break;
            }
        }

        Object value(int depth) {
            if (depth > 512) throw err("JSON terlalu dalam");
            if (i >= s.length()) throw err("JSON terpotong");
            char c = s.charAt(i);
            switch (c) {
                case '{': return object(depth);
                case '[': return array(depth);
                case '"': return string();
                case 't': lit("true"); return Boolean.TRUE;
                case 'f': lit("false"); return Boolean.FALSE;
                case 'n': lit("null"); return null;
                default:
                    if (c == '-' || (c >= '0' && c <= '9')) return number();
                    throw err("Karakter tidak terduga '" + c + "'");
            }
        }

        void lit(String w) {
            if (!s.startsWith(w, i)) throw err("Literal tidak valid");
            i += w.length();
        }

        Map<String, Object> object(int depth) {
            Map<String, Object> m = new LinkedHashMap<>();
            i++; ws();
            if (i < s.length() && s.charAt(i) == '}') { i++; return m; }
            while (true) {
                ws();
                if (i >= s.length() || s.charAt(i) != '"') throw err("Kunci objek harus string");
                String k = string();
                ws();
                if (i >= s.length() || s.charAt(i) != ':') throw err("Diharapkan ':'");
                i++; ws();
                m.put(k, value(depth + 1));
                ws();
                if (i >= s.length()) throw err("Objek terpotong");
                char c = s.charAt(i++);
                if (c == '}') return m;
                if (c != ',') throw err("Diharapkan ',' atau '}'");
            }
        }

        List<Object> array(int depth) {
            List<Object> a = new ArrayList<>();
            i++; ws();
            if (i < s.length() && s.charAt(i) == ']') { i++; return a; }
            while (true) {
                ws();
                a.add(value(depth + 1));
                ws();
                if (i >= s.length()) throw err("Array terpotong");
                char c = s.charAt(i++);
                if (c == ']') return a;
                if (c != ',') throw err("Diharapkan ',' atau ']'");
            }
        }

        String string() {
            i++; // lewati tanda kutip pembuka
            int start = i;
            // Jalur cepat: string tanpa escape (mis. foto base64).
            while (i < s.length()) {
                char c = s.charAt(i);
                if (c == '"') { String r = s.substring(start, i); i++; return r; }
                if (c == '\\') break;
                i++;
            }
            StringBuilder sb = new StringBuilder(s.substring(start, i));
            while (i < s.length()) {
                char c = s.charAt(i++);
                if (c == '"') return sb.toString();
                if (c != '\\') { sb.append(c); continue; }
                if (i >= s.length()) break;
                char e = s.charAt(i++);
                switch (e) {
                    case '"': sb.append('"'); break;
                    case '\\': sb.append('\\'); break;
                    case '/': sb.append('/'); break;
                    case 'b': sb.append('\b'); break;
                    case 'f': sb.append('\f'); break;
                    case 'n': sb.append('\n'); break;
                    case 'r': sb.append('\r'); break;
                    case 't': sb.append('\t'); break;
                    case 'u':
                        if (i + 4 > s.length()) throw err("Escape unicode terpotong");
                        sb.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
                        i += 4;
                        break;
                    default: throw err("Escape tidak valid");
                }
            }
            throw err("String terpotong");
        }

        Object number() {
            int start = i;
            boolean frac = false;
            if (s.charAt(i) == '-') i++;
            while (i < s.length()) {
                char c = s.charAt(i);
                if (c >= '0' && c <= '9') i++;
                else if (c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') { frac = true; i++; }
                else break;
            }
            String t = s.substring(start, i);
            if (t.equals("-")) throw err("Angka tidak valid");
            try {
                if (!frac && t.length() < 18) return Long.parseLong(t);
                double d = Double.parseDouble(t);
                if (!frac && d == Math.rint(d) && Math.abs(d) < 9.0e18) return (long) d;
                return d;
            } catch (NumberFormatException ex) {
                throw err("Angka tidak valid");
            }
        }
    }
}
