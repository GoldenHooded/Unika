using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;
using System.Text;

namespace Unika
{
    /// <summary>
    /// Minimal JSON parser. No external packages — works on all Unity / Mono versions.
    /// </summary>
    public class JsonObj
    {
        private readonly Dictionary<string, string> _raw;
        private JsonObj(Dictionary<string, string> raw) { _raw = raw; }

        // ── Parse ──────────────────────────────────────────────────────────

        public static JsonObj Parse(string json)
        {
            var data = new Dictionary<string, string>();
            if (string.IsNullOrEmpty(json)) return new JsonObj(data);
            json = json.Trim();
            if (!json.StartsWith("{")) return new JsonObj(data);

            int i = 1;
            while (i < json.Length)
            {
                SkipWs(json, ref i);
                if (i >= json.Length || json[i] == '}') break;
                if (json[i] == ',') { i++; continue; }
                if (json[i] != '"') { i++; continue; }

                string key = ReadString(json, ref i);
                SkipWs(json, ref i);
                if (i >= json.Length || json[i] != ':') continue;
                i++; // skip ':'
                SkipWs(json, ref i);
                string value = ReadValue(json, ref i);
                data[key] = value;
            }
            return new JsonObj(data);
        }

        private static void SkipWs(string s, ref int i)
        {
            while (i < s.Length && s[i] <= ' ') i++;
        }

        private static string ReadString(string s, ref int i)
        {
            i++; // skip opening "
            var sb = new StringBuilder();
            while (i < s.Length)
            {
                char c = s[i++];
                if (c == '\\' && i < s.Length)
                {
                    char esc = s[i++];
                    switch (esc)
                    {
                        case '"':  sb.Append('"');  break;
                        case '\\': sb.Append('\\'); break;
                        case '/':  sb.Append('/');  break;
                        case 'n':  sb.Append('\n'); break;
                        case 'r':  sb.Append('\r'); break;
                        case 't':  sb.Append('\t'); break;
                        default:   sb.Append(esc);  break;
                    }
                }
                else if (c == '"') break;
                else sb.Append(c);
            }
            return sb.ToString();
        }

        private static string ReadValue(string s, ref int i)
        {
            if (i >= s.Length) return "";
            char c = s[i];
            if (c == '"') return ReadString(s, ref i);
            if (c == '{' || c == '[') return ReadBlock(s, ref i);
            // number / bool / null
            int start = i;
            while (i < s.Length && s[i] != ',' && s[i] != '}' && s[i] != ']') i++;
            return s.Substring(start, i - start).Trim();
        }

        private static string ReadBlock(string s, ref int i)
        {
            char open = s[i], close = open == '{' ? '}' : ']';
            int depth = 0, start = i;
            bool inStr = false;
            while (i < s.Length)
            {
                char c = s[i];
                // simple escape detection: skip \" inside strings
                if (c == '"' && (i == 0 || s[i - 1] != '\\')) inStr = !inStr;
                if (!inStr)
                {
                    if (c == open)  depth++;
                    else if (c == close) { depth--; if (depth == 0) { i++; break; } }
                }
                i++;
            }
            return s.Substring(start, i - start);
        }

        // ── Accessors ─────────────────────────────────────────────────────

        public bool Has(string key) => _raw.ContainsKey(key);

        /// <summary>Returns string value, or <paramref name="def"/> if absent.</summary>
        public string Str(string key, string def = "")
            => _raw.TryGetValue(key, out var v) ? v : def;

        /// <summary>Returns float value (invariant culture), or <paramref name="def"/> if absent.</summary>
        public float Flt(string key, float def = 0f)
        {
            if (!_raw.TryGetValue(key, out var v)) return def;
            return float.TryParse(v.Trim('"'), NumberStyles.Float,
                CultureInfo.InvariantCulture, out var f) ? f : def;
        }

        /// <summary>Returns int value, or <paramref name="def"/> if absent.</summary>
        public int Int(string key, int def = 0)
        {
            if (!_raw.TryGetValue(key, out var v)) return def;
            return int.TryParse(v.Trim('"'), out var n) ? n : def;
        }

        /// <summary>Returns bool value, or <paramref name="def"/> if absent.</summary>
        public bool Bool(string key, bool def = false)
        {
            if (!_raw.TryGetValue(key, out var v)) return def;
            return v.Trim() == "true";
        }

        /// <summary>Parses a nested JSON object value.</summary>
        public JsonObj Sub(string key)
        {
            if (!_raw.TryGetValue(key, out var v)) return Parse("{}");
            return Parse(v);
        }
    }

    /// <summary>
    /// Minimal JSON serializer using reflection.
    /// Handles anonymous types, IEnumerable, IDictionary, and primitives.
    /// </summary>
    public static class JsonWriter
    {
        public static string Serialize(object obj)
        {
            var sb = new StringBuilder(256);
            Write(obj, sb);
            return sb.ToString();
        }

        private static void Write(object obj, StringBuilder sb)
        {
            if (obj == null)                                         { sb.Append("null"); return; }
            if (obj is bool b)                                       { sb.Append(b ? "true" : "false"); return; }
            if (obj is string s)                                     { WriteString(s, sb); return; }
            if (obj is int  || obj is long || obj is short || obj is byte)
                { sb.Append(Convert.ToInt64(obj).ToString(CultureInfo.InvariantCulture)); return; }
            if (obj is float || obj is double)
                { sb.Append(Convert.ToDouble(obj).ToString("G", CultureInfo.InvariantCulture)); return; }
            if (obj is IDictionary dict)                             { WriteDict(dict, sb); return; }
            if (obj is IEnumerable list)                             { WriteList(list, sb); return; }
            WriteObject(obj, sb);   // anonymous types / plain classes via reflection
        }

        private static void WriteString(string s, StringBuilder sb)
        {
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"':  sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n");  break;
                    case '\r': sb.Append("\\r");  break;
                    case '\t': sb.Append("\\t");  break;
                    default:   sb.Append(c);      break;
                }
            }
            sb.Append('"');
        }

        private static void WriteList(IEnumerable list, StringBuilder sb)
        {
            sb.Append('[');
            bool first = true;
            foreach (var item in list) { if (!first) sb.Append(','); Write(item, sb); first = false; }
            sb.Append(']');
        }

        private static void WriteDict(IDictionary dict, StringBuilder sb)
        {
            sb.Append('{');
            bool first = true;
            foreach (DictionaryEntry entry in dict)
            {
                if (!first) sb.Append(',');
                WriteString(entry.Key.ToString(), sb);
                sb.Append(':');
                Write(entry.Value, sb);
                first = false;
            }
            sb.Append('}');
        }

        private static void WriteObject(object obj, StringBuilder sb)
        {
            sb.Append('{');
            bool first = true;
            foreach (var prop in obj.GetType().GetProperties(
                BindingFlags.Public | BindingFlags.Instance))
            {
                object val;
                try { val = prop.GetValue(obj, null); }
                catch { continue; }
                if (!first) sb.Append(',');
                WriteString(prop.Name, sb);
                sb.Append(':');
                Write(val, sb);
                first = false;
            }
            sb.Append('}');
        }
    }
}
