using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace Unika
{
    /// <summary>
    /// Provides asset tree data for the Unika asset viewer panel.
    /// Exposes a menu item and utility methods for asset browsing.
    /// </summary>
    public static class UnikaAssetProvider
    {
        [MenuItem("Unika/Refresh Asset Index")]
        public static void RefreshAssetIndex()
        {
            AssetDatabase.Refresh();
            Debug.Log("[Unika] Asset index refreshed.");
        }

        [MenuItem("Unika/Show Bridge Status")]
        public static void ShowStatus()
        {
            Debug.Log("[Unika] Bridge is running. Connect Unika to use AI features.");
        }

        public static string GetAssetGuid(string assetPath)
        {
            return AssetDatabase.AssetPathToGUID(assetPath);
        }

        public static string GetAssetPath(string guid)
        {
            return AssetDatabase.GUIDToAssetPath(guid);
        }
    }
}
