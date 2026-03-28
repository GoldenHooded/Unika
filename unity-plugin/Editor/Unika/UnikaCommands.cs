using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Compilation;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Unika
{
    /// <summary>
    /// Handles all agent commands dispatched by UnikaBridge.
    /// All methods run on the Unity main thread.
    /// Uses UnikaJson — no external packages required.
    /// </summary>
    public static class UnikaCommands
    {
        public static object Dispatch(string action, JsonObj p)
        {
            switch (action)
            {
                case "GetHierarchy":    return GetHierarchy(p);
                case "GetObject":       return GetObject(p);
                case "CreateObject":    return CreateObject(p);
                case "DeleteObject":    return DeleteObject(p);
                case "SetProperty":     return SetProperty(p);
                case "AddComponent":    return AddComponent(p);
                case "RemoveComponent": return RemoveComponent(p);
                case "GetAssets":       return GetAssets(p);
                case "CreateScript":    return CreateScript(p);
                case "ReadConsole":     return UnikaConsoleCapture.GetLogs(p.Int("count", 20), p.Str("filter", "all"));
                case "ClearConsole":    return ClearConsole();
                case "SwitchScene":     return SwitchScene(p);
                case "GetScenes":       return GetScenes();
                case "ExecuteMenu":     return ExecuteMenu(p);
                case "SetPlayMode":     return SetPlayMode(p);
                case "RefreshAssets":   return RefreshAssets();
                case "Compile":         return Compile();
                default:                throw new Exception("Unknown action: " + action);
            }
        }

        // ── Hierarchy ─────────────────────────────────────────────────────

        private static object GetHierarchy(JsonObj p)
        {
            var roots = new List<object>();
            for (int i = 0; i < SceneManager.sceneCount; i++)
            {
                var scene = SceneManager.GetSceneAt(i);
                if (!scene.isLoaded) continue;
                foreach (var go in scene.GetRootGameObjects())
                    roots.Add(GameObjectToTree(go));
            }
            return roots;
        }

        private static object GameObjectToTree(GameObject go)
        {
            var children = new List<object>();
            foreach (Transform child in go.transform)
                children.Add(GameObjectToTree(child.gameObject));

            return new
            {
                name = go.name,
                active = go.activeSelf,
                tag = go.tag,
                layer = LayerMask.LayerToName(go.layer),
                components = go.GetComponents<Component>()
                              .Select(c => c != null ? c.GetType().Name : "null")
                              .ToArray(),
                children
            };
        }

        private static object GetObject(JsonObj p)
        {
            var name = p.Str("name");
            var go = FindGO(name);
            if (go == null) return new { error = "GameObject not found: " + name };

            var components = new List<object>();
            foreach (var comp in go.GetComponents<Component>())
            {
                if (comp == null) continue;
                var fields = new Dictionary<string, string>();
                var so = new SerializedObject(comp);
                var prop = so.GetIterator();
                prop.NextVisible(true);
                int count = 0;
                while (prop.NextVisible(false) && count < 20)
                {
                    fields[prop.name] = prop.propertyType.ToString() + ": " + GetPropValue(prop);
                    count++;
                }
                components.Add(new { type = comp.GetType().Name, fields });
            }

            var t = go.transform;
            return new
            {
                name = go.name,
                active = go.activeSelf,
                tag = go.tag,
                layer = LayerMask.LayerToName(go.layer),
                transform = new
                {
                    position = new { t.position.x, t.position.y, t.position.z },
                    rotation = new { t.eulerAngles.x, t.eulerAngles.y, t.eulerAngles.z },
                    scale    = new { t.localScale.x, t.localScale.y, t.localScale.z },
                },
                components
            };
        }

        private static string GetPropValue(SerializedProperty prop)
        {
            switch (prop.propertyType)
            {
                case SerializedPropertyType.Float:           return prop.floatValue.ToString("F3");
                case SerializedPropertyType.Integer:         return prop.intValue.ToString();
                case SerializedPropertyType.Boolean:         return prop.boolValue.ToString();
                case SerializedPropertyType.String:          return prop.stringValue;
                case SerializedPropertyType.Vector2:         return prop.vector2Value.ToString();
                case SerializedPropertyType.Vector3:         return prop.vector3Value.ToString();
                case SerializedPropertyType.Color:           return prop.colorValue.ToString();
                case SerializedPropertyType.ObjectReference: return prop.objectReferenceValue != null ? prop.objectReferenceValue.name : "null";
                default:                                     return prop.propertyType.ToString();
            }
        }

        // ── Create / Delete ───────────────────────────────────────────────

        private static object CreateObject(JsonObj p)
        {
            var name   = p.Str("name", "NewObject");
            var type   = p.Str("type", "Empty");
            var parent = p.Str("parent");
            var pos    = p.Sub("position");

            GameObject go;
            switch (type)
            {
                case "Cube":        go = GameObject.CreatePrimitive(PrimitiveType.Cube);    break;
                case "Sphere":      go = GameObject.CreatePrimitive(PrimitiveType.Sphere);  break;
                case "Capsule":     go = GameObject.CreatePrimitive(PrimitiveType.Capsule); break;
                case "Plane":       go = GameObject.CreatePrimitive(PrimitiveType.Plane);   break;
                case "Camera":      go = new GameObject(name, typeof(Camera));              break;
                case "Light":       go = new GameObject(name, typeof(Light));               break;
                case "Canvas":      go = new GameObject(name, typeof(Canvas));              break;
                case "AudioSource": go = new GameObject(name, typeof(AudioSource));         break;
                default:            go = new GameObject();                                  break;
            }
            go.name = name;

            if (!string.IsNullOrEmpty(parent))
            {
                var parentGO = FindGO(parent);
                if (parentGO != null) go.transform.SetParent(parentGO.transform, false);
            }

            if (pos.Has("x") || pos.Has("y") || pos.Has("z"))
                go.transform.position = new Vector3(pos.Flt("x"), pos.Flt("y"), pos.Flt("z"));

            Undo.RegisterCreatedObjectUndo(go, "Create " + name);
            EditorUtility.SetDirty(go);
            return new { created = go.name, instanceId = go.GetInstanceID() };
        }

        private static object DeleteObject(JsonObj p)
        {
            var go = FindGO(p.Str("name"));
            if (go == null) return new { error = "Not found" };
            Undo.DestroyObjectImmediate(go);
            return new { deleted = p.Str("name") };
        }

        // ── Components ────────────────────────────────────────────────────

        private static object SetProperty(JsonObj p)
        {
            var go = FindGO(p.Str("object"));
            if (go == null) return new { error = "GameObject not found" };

            var compName = p.Str("component");
            var comp = go.GetComponents<Component>()
                         .FirstOrDefault(c => c != null && c.GetType().Name == compName);
            if (comp == null) return new { error = "Component " + compName + " not found" };

            var propName = p.Str("property");
            var value    = p.Str("value");

            var so   = new SerializedObject(comp);
            var prop = so.FindProperty(propName);
            if (prop == null) return new { error = "Property " + propName + " not found" };

            switch (prop.propertyType)
            {
                case SerializedPropertyType.Float:
                    float fv;
                    if (float.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out fv))
                        prop.floatValue = fv;
                    break;
                case SerializedPropertyType.Integer:
                    int iv;
                    if (int.TryParse(value, out iv)) prop.intValue = iv;
                    break;
                case SerializedPropertyType.Boolean:
                    bool bv;
                    if (bool.TryParse(value, out bv)) prop.boolValue = bv;
                    break;
                case SerializedPropertyType.String:
                    prop.stringValue = value;
                    break;
                case SerializedPropertyType.Vector3:
                    var v3 = JsonObj.Parse(value);
                    prop.vector3Value = new Vector3(v3.Flt("x"), v3.Flt("y"), v3.Flt("z"));
                    break;
                default:
                    return new { error = "Cannot set property type: " + prop.propertyType };
            }
            so.ApplyModifiedProperties();
            EditorUtility.SetDirty(comp);
            return new { ok = true, property = propName, value };
        }

        private static object AddComponent(JsonObj p)
        {
            var go = FindGO(p.Str("object"));
            if (go == null) return new { error = "GameObject not found" };
            var typeName = p.Str("component");
            Type type = null;
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                try { type = asm.GetType(typeName) ?? asm.GetTypes().FirstOrDefault(t => t.Name == typeName); }
                catch { }
                if (type != null) break;
            }
            if (type == null) return new { error = "Component type not found: " + typeName };
            Undo.AddComponent(go, type);
            return new { added = typeName };
        }

        private static object RemoveComponent(JsonObj p)
        {
            var go = FindGO(p.Str("object"));
            if (go == null) return new { error = "GameObject not found" };
            var compName = p.Str("component");
            var comp = go.GetComponents<Component>()
                         .FirstOrDefault(c => c != null && c.GetType().Name == compName);
            if (comp == null) return new { error = "Component not found: " + compName };
            Undo.DestroyObjectImmediate(comp);
            return new { removed = compName };
        }

        // ── Assets ────────────────────────────────────────────────────────

        private static object GetAssets(JsonObj p)
        {
            var rootPath   = p.Str("path", "Assets");
            var typeFilter = p.Str("type");

            string[] guids = string.IsNullOrEmpty(typeFilter)
                ? AssetDatabase.FindAssets("", new[] { rootPath })
                : AssetDatabase.FindAssets("t:" + typeFilter, new[] { rootPath });

            return guids.Select(g =>
            {
                var path = AssetDatabase.GUIDToAssetPath(g);
                var ext  = Path.GetExtension(path).ToLower();
                return new { path, name = Path.GetFileName(path), ext, type = GetAssetType(ext), guid = g };
            }).ToArray();
        }

        private static string GetAssetType(string ext)
        {
            switch (ext)
            {
                case ".cs":       return "script";
                case ".prefab":   return "prefab";
                case ".mat":      return "material";
                case ".shader":   return "shader";
                case ".unity":    return "scene";
                case ".png":
                case ".jpg":
                case ".jpeg":
                case ".tga":
                case ".psd":      return "texture";
                case ".mp3":
                case ".wav":
                case ".ogg":      return "audio";
                case ".anim":     return "animation";
                case ".controller": return "animator";
                case ".asset":    return "asset";
                default:          return "file";
            }
        }

        private static object CreateScript(JsonObj p)
        {
            var assetPath = p.Str("path");
            var template  = p.Str("template", "MonoBehaviour");
            var className = p.Str("class_name");
            if (string.IsNullOrEmpty(className))
                className = Path.GetFileNameWithoutExtension(assetPath);

            var content  = GenerateScriptTemplate(template, className);
            var fullPath = Path.Combine(Application.dataPath, "..", assetPath);
            var dir = Path.GetDirectoryName(fullPath);
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

            File.WriteAllText(fullPath, content, System.Text.Encoding.UTF8);
            AssetDatabase.Refresh();
            return new { created = assetPath, className };
        }

        private static string GenerateScriptTemplate(string template, string className)
        {
            switch (template)
            {
                case "ScriptableObject":
                    return "using UnityEngine;\n\n" +
                           "[CreateAssetMenu(fileName = \"" + className + "\", menuName = \"Unika/" + className + "\")]\n" +
                           "public class " + className + " : ScriptableObject\n{\n}\n";

                case "Editor":
                    return "using UnityEditor;\nusing UnityEngine;\n\n" +
                           "[CustomEditor(typeof(MonoBehaviour))]\n" +
                           "public class " + className + " : Editor\n{\n" +
                           "    public override void OnInspectorGUI()\n    {\n" +
                           "        DrawDefaultInspector();\n    }\n}\n";

                case "Empty":
                    return "using UnityEngine;\n\npublic class " + className + "\n{\n}\n";

                default:
                    return "using System.Collections;\nusing System.Collections.Generic;\nusing UnityEngine;\n\n" +
                           "public class " + className + " : MonoBehaviour\n{\n" +
                           "    private void Awake() { }\n" +
                           "    private void Start() { }\n" +
                           "    private void Update() { }\n}\n";
            }
        }

        // ── Console ───────────────────────────────────────────────────────

        private static object ClearConsole()
        {
            var assembly = System.Reflection.Assembly.GetAssembly(typeof(SceneView));
            var logEntries = assembly != null ? assembly.GetType("UnityEditor.LogEntries") : null;
            if (logEntries != null)
                logEntries.GetMethod("Clear")?.Invoke(null, null);
            return new { ok = true };
        }

        // ── Scenes ────────────────────────────────────────────────────────

        private static object SwitchScene(JsonObj p)
        {
            var name = p.Str("name");
            var scenes = AssetDatabase.FindAssets("t:Scene");
            string scenePath = null;
            foreach (var g in scenes)
            {
                var ap = AssetDatabase.GUIDToAssetPath(g);
                if (Path.GetFileNameWithoutExtension(ap) == name || ap == name)
                { scenePath = ap; break; }
            }
            if (scenePath == null) return new { error = "Scene not found: " + name };
            EditorSceneManager.OpenScene(scenePath);
            return new { opened = scenePath };
        }

        private static object GetScenes()
        {
            return AssetDatabase.FindAssets("t:Scene").Select(g =>
            {
                var path = AssetDatabase.GUIDToAssetPath(g);
                return new { path, name = Path.GetFileNameWithoutExtension(path) };
            }).ToArray();
        }

        // ── Editor ────────────────────────────────────────────────────────

        private static object ExecuteMenu(JsonObj p)
        {
            var path = p.Str("path");
            bool ok = EditorApplication.ExecuteMenuItem(path);
            return new { ok, path };
        }

        private static object SetPlayMode(JsonObj p)
        {
            var mode = p.Str("mode", "play");
            switch (mode)
            {
                case "play":  EditorApplication.isPlaying = true;  break;
                case "pause": EditorApplication.isPaused  = true;  break;
                case "stop":  EditorApplication.isPlaying = false; break;
            }
            return new { mode };
        }

        private static object RefreshAssets()
        {
            AssetDatabase.Refresh();
            return new { ok = true };
        }

        private static object Compile()
        {
            // Clear the console so errors from previous compilations don't confuse the agent
            var assembly = System.Reflection.Assembly.GetAssembly(typeof(SceneView));
            var logEntries = assembly != null ? assembly.GetType("UnityEditor.LogEntries") : null;
            logEntries?.GetMethod("Clear")?.Invoke(null, null);

            // Trigger full script recompilation
            CompilationPipeline.RequestScriptCompilation(RequestScriptCompilationOptions.CleanBuildCache);
            AssetDatabase.Refresh();

            bool isCompiling = EditorApplication.isCompiling;
            return new
            {
                ok = true,
                compiling = isCompiling,
                message = isCompiling
                    ? "Compilation started. Use WAIT(5) then UNITY_READ_CONSOLE to check for errors."
                    : "Compilation request sent. Unity may compile on next editor update."
            };
        }

        // ── Helpers ───────────────────────────────────────────────────────

        private static GameObject FindGO(string name)
        {
            if (string.IsNullOrEmpty(name)) return null;
            var go = GameObject.Find(name);
            if (go != null) return go;
            return Resources.FindObjectsOfTypeAll<GameObject>()
                .FirstOrDefault(g => g.name == name && g.scene.IsValid());
        }
    }
}
