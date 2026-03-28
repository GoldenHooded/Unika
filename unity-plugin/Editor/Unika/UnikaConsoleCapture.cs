using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Unika
{
    /// <summary>
    /// Captures Unity console logs and stores them for retrieval.
    /// </summary>
    [UnityEditor.InitializeOnLoad]
    public static class UnikaConsoleCapture
    {
        private const int MAX_LOGS = 500;
        private static readonly ConcurrentQueue<LogEntry> _logs = new();

        static UnikaConsoleCapture()
        {
            Application.logMessageReceived += OnLog;
        }

        private static void OnLog(string condition, string stackTrace, LogType type)
        {
            _logs.Enqueue(new LogEntry
            {
                message    = condition,
                stackTrace = stackTrace,
                type       = type.ToString().ToLower(),
                timestamp  = System.DateTime.Now.ToString("HH:mm:ss"),
            });
            // Keep buffer bounded
            while (_logs.Count > MAX_LOGS)
                _logs.TryDequeue(out _);
        }

        public static object GetLogs(int count, string filter)
        {
            var all = _logs.ToArray();
            IEnumerable<LogEntry> filtered = filter switch
            {
                "error"   => all.Where(l => l.type == "error" || l.type == "exception"),
                "warning" => all.Where(l => l.type == "warning"),
                "log"     => all.Where(l => l.type == "log"),
                _         => all,
            };
            return filtered.TakeLast(count).ToArray();
        }

        private class LogEntry
        {
            public string message;
            public string stackTrace;
            public string type;
            public string timestamp;
        }
    }
}
