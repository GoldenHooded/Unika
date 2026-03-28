using System;
using System.Collections.Concurrent;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEditor;
using UnityEngine;

namespace Unika
{
    /// <summary>
    /// Minimal HTTP REST server using raw TcpListener (no HttpListener / HTTP.sys).
    /// Works reliably on all Mono versions inside Unity Editor.
    ///
    ///   GET  /ping     → {"status":"ok"}
    ///   POST /command  → {"id":"...","action":"...","params":{...}}  → JSON response
    ///
    /// Auto-starts when Unity Editor loads ([InitializeOnLoad]).
    /// </summary>
    [InitializeOnLoad]
    public static class UnikaBridge
    {
        private const int PORT = 6400;

        private static TcpListener  _listener;
        private static Thread       _serverThread;
        private static bool         _running;
        private static readonly ConcurrentQueue<Action> _mainThreadQueue =
            new ConcurrentQueue<Action>();

        // ── Lifecycle ────────────────────────────────────────────────────────────

        static UnikaBridge()
        {
            Start();
            EditorApplication.update                  += ProcessMainThreadQueue;
            AssemblyReloadEvents.beforeAssemblyReload += Stop;
        }

        public static void Start()
        {
            if (_running) return;
            _running      = true;
            _serverThread = new Thread(RunServer) { IsBackground = true, Name = "UnikaBridge" };
            _serverThread.Start();
        }

        public static void Stop()
        {
            _running = false;
            try { _listener?.Stop(); } catch { }
            _listener = null;
        }

        // ── TCP server loop ──────────────────────────────────────────────────────

        private static void RunServer()
        {
            try
            {
                _listener = new TcpListener(IPAddress.Loopback, PORT);
                _listener.Start();
                Debug.Log("[Unika] Bridge listening on http://localhost:" + PORT);

                while (_running)
                {
                    try
                    {
                        // AcceptTcpClient blocks until connection or listener stopped
                        var client = _listener.AcceptTcpClient();
                        ThreadPool.QueueUserWorkItem(_ => HandleClient(client));
                    }
                    catch (SocketException) when (!_running) { break; }
                    catch (Exception e) { Debug.LogError("[Unika] Accept error: " + e.Message); }
                }
            }
            catch (Exception e)
            {
                Debug.LogError("[Unika] Failed to start bridge on port " + PORT + ": " + e.Message);
            }
            finally
            {
                try { _listener?.Stop(); } catch { }
                _listener = null;
            }
        }

        // ── Per-connection handler ───────────────────────────────────────────────

        private static void HandleClient(TcpClient client)
        {
            try
            {
                client.ReceiveTimeout = 5000;
                client.SendTimeout    = 30000;

                using (var stream = client.GetStream())
                {
                    // Read request headers (until \r\n\r\n)
                    var headerBuf = new byte[8192];
                    int totalRead = 0;
                    int headerEnd = -1;

                    while (totalRead < headerBuf.Length)
                    {
                        int n = stream.Read(headerBuf, totalRead, 1);
                        if (n == 0) break;
                        totalRead++;

                        // Detect end of headers: \r\n\r\n
                        if (totalRead >= 4 &&
                            headerBuf[totalRead - 4] == '\r' && headerBuf[totalRead - 3] == '\n' &&
                            headerBuf[totalRead - 2] == '\r' && headerBuf[totalRead - 1] == '\n')
                        {
                            headerEnd = totalRead;
                            break;
                        }
                    }

                    if (headerEnd < 0)
                    {
                        SendResponse(stream, 400, "Bad Request", "{\"error\":\"headers too large\"}");
                        return;
                    }

                    var headerText = Encoding.ASCII.GetString(headerBuf, 0, headerEnd);
                    var lines = headerText.Split(new[] { "\r\n" }, StringSplitOptions.RemoveEmptyEntries);
                    if (lines.Length == 0)
                    {
                        SendResponse(stream, 400, "Bad Request", "{\"error\":\"empty request\"}");
                        return;
                    }

                    // Parse request line: METHOD /path HTTP/1.x
                    var requestParts = lines[0].Split(' ');
                    var method = requestParts.Length > 0 ? requestParts[0].ToUpperInvariant() : "";
                    var path   = requestParts.Length > 1 ? requestParts[1] : "/";

                    // Parse Content-Length
                    int contentLength = 0;
                    foreach (var line in lines)
                    {
                        if (line.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase))
                        {
                            int.TryParse(line.Substring(15).Trim(), out contentLength);
                            break;
                        }
                    }

                    string responseBody;

                    if (method == "GET" && path == "/ping")
                    {
                        responseBody = "{\"status\":\"ok\"}";
                    }
                    else if (method == "POST" && path == "/command")
                    {
                        // Read body
                        var bodyBytes = new byte[contentLength];
                        int bodyRead = 0;
                        while (bodyRead < contentLength)
                        {
                            int n = stream.Read(bodyBytes, bodyRead, contentLength - bodyRead);
                            if (n == 0) break;
                            bodyRead += n;
                        }
                        var body = Encoding.UTF8.GetString(bodyBytes, 0, bodyRead);

                        // Dispatch to Unity main thread and wait for result
                        responseBody = DispatchCommand(body).GetAwaiter().GetResult();
                    }
                    else
                    {
                        SendResponse(stream, 404, "Not Found", "{\"error\":\"not found\"}");
                        return;
                    }

                    SendResponse(stream, 200, "OK", responseBody);
                }
            }
            catch (Exception e)
            {
                Debug.LogWarning("[Unika] Client error: " + e.Message);
            }
            finally
            {
                try { client.Close(); } catch { }
            }
        }

        private static void SendResponse(Stream stream, int code, string status, string body)
        {
            var bodyBytes = Encoding.UTF8.GetBytes(body);
            var header    = string.Format(
                "HTTP/1.1 {0} {1}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {2}\r\nConnection: close\r\n\r\n",
                code, status, bodyBytes.Length);
            var headerBytes = Encoding.ASCII.GetBytes(header);
            stream.Write(headerBytes, 0, headerBytes.Length);
            stream.Write(bodyBytes,   0, bodyBytes.Length);
            stream.Flush();
        }

        // ── Command dispatch → Unity main thread ─────────────────────────────────

        private static Task<string> DispatchCommand(string json)
        {
            var tcs = new TaskCompletionSource<string>();

            _mainThreadQueue.Enqueue(() =>
            {
                string reqId = "";
                try
                {
                    var root   = JsonObj.Parse(json);
                    reqId      = root.Str("id");
                    var action = root.Str("action");
                    var prms   = root.Sub("params");

                    object data = UnikaCommands.Dispatch(action, prms);
                    tcs.SetResult(BuildResponse(reqId, data, null));
                }
                catch (Exception e)
                {
                    tcs.SetResult(BuildResponse(reqId, null, e.Message));
                }
            });

            return tcs.Task;
        }

        private static string BuildResponse(string id, object data, string error)
        {
            try
            {
                if (error != null)
                    return "{\"id\":"    + JsonWriter.Serialize(id)    +
                           ",\"error\":" + JsonWriter.Serialize(error) + "}";

                return "{\"id\":"   + JsonWriter.Serialize(id)                   +
                       ",\"data\":" + JsonWriter.Serialize(data ?? new object()) + "}";
            }
            catch (Exception e)
            {
                return "{\"id\":"    + JsonWriter.Serialize(id) +
                       ",\"error\":" + JsonWriter.Serialize("Serialization failed: " + e.Message) + "}";
            }
        }

        // ── Main-thread queue (called every Editor update) ────────────────────────

        private static void ProcessMainThreadQueue()
        {
            while (_mainThreadQueue.TryDequeue(out var action))
            {
                try   { action(); }
                catch (Exception e) { Debug.LogError("[Unika] Main thread error: " + e); }
            }
        }
    }
}
