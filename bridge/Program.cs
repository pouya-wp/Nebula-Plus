// Nebula Bridge
// Exposes the Windows "System Media Transport Controls" (the media session that
// Spotify desktop, Apple Music, foobar, VLC, etc. publish) to Zen over a tiny
// localhost-only HTTP API, so Nebula Plus can show and control desktop players.
//
//   GET  /state            -> current desktop media session as JSON
//   GET  /art/{id}         -> album art bytes for the current track
//   POST /cmd/{action}     -> toggle | play | pause | next | prev
//   POST /seek?pos={sec}   -> seek to position in seconds

using System.Security.Cryptography;
using System.Text;
using Windows.Media.Control;
using Windows.Storage.Streams;

const int Port = 47321;

// Browser sessions are already handled inside Zen itself.
string[] ignoredApps = ["zen", "firefox", "chrome", "msedge", "brave", "opera", "vivaldi"];

var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.UseUrls($"http://127.0.0.1:{Port}");
builder.Logging.ClearProviders();
var app = builder.Build();

var manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
var art = new ArtCache();
var spectrum = new NebulaBridge.Spectrum();
var stats = new NebulaBridge.ListeningStats();

// Count listening time in the background (works even while Zen is closed).
var statsTimer = new Timer(async _ =>
{
    try
    {
        var s = PickSession();
        if (s?.GetPlaybackInfo()?.PlaybackStatus != GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing) return;
        var p = await s.TryGetMediaPropertiesAsync();
        stats.Add(p?.Title ?? "", p?.Artist ?? "", 5);
    }
    catch { }
}, null, 5000, 5000);

bool IsBrowser(string aumid) =>
    ignoredApps.Any(a => aumid.Contains(a, StringComparison.OrdinalIgnoreCase)) ||
    // Firefox-based browsers (Zen included) register under their 16-hex install hash.
    System.Text.RegularExpressions.Regex.IsMatch(aumid, "^[0-9A-Fa-f]{16}$");

GlobalSystemMediaTransportControlsSession? PickSession()
{
    var sessions = manager.GetSessions()
        .Where(s => !IsBrowser(s.SourceAppUserModelId))
        .ToList();
    if (sessions.Count == 0) return null;

    var playing = sessions.FirstOrDefault(s =>
        s.GetPlaybackInfo()?.PlaybackStatus ==
        GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing);
    if (playing != null) return playing;

    var current = manager.GetCurrentSession();
    return sessions.FirstOrDefault(s => s.SourceAppUserModelId == current?.SourceAppUserModelId)
        ?? sessions[0];
}

static string AppName(string aumid)
{
    // "Spotify.exe" / "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify" -> "Spotify"
    var name = aumid.Split('!').Last();
    name = name.Split('\\').Last();
    if (name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) name = name[..^4];
    if (name.Contains('.'))
    {
        // Reverse-DNS ids ("com.limusic.desktop") -> the most specific real word.
        string[] generic = ["com", "org", "net", "io", "app", "desktop", "music", "player", "exe"];
        name = name.Split('.').FirstOrDefault(p => !generic.Contains(p.ToLowerInvariant())) ?? name.Split('.')[0];
    }
    return name.Length > 0 ? char.ToUpperInvariant(name[0]) + name[1..] : name;
}

// Last requests, for debugging clients: GET /debug/requests
var recent = new System.Collections.Concurrent.ConcurrentQueue<string>();

app.Use(async (ctx, next) =>
{
    if (ctx.Request.Path != "/bands") recent.Enqueue($"{DateTime.Now:HH:mm:ss} {ctx.Request.Method} {ctx.Request.Path} origin={ctx.Request.Headers.Origin} ct={ctx.Request.ContentType} len={ctx.Request.ContentLength}");
    while (recent.Count > 20) recent.TryDequeue(out _);
    ctx.Response.Headers["Access-Control-Allow-Origin"] = "*";
    ctx.Response.Headers["Cache-Control"] = "no-store";
    // Pages (the new tab) preflight POSTs to a local server, including
    // Private/Local Network Access checks.
    if (HttpMethods.IsOptions(ctx.Request.Method))
    {
        ctx.Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
        ctx.Response.Headers["Access-Control-Allow-Headers"] = "*";
        ctx.Response.Headers["Access-Control-Allow-Private-Network"] = "true";
        ctx.Response.Headers["Access-Control-Max-Age"] = "600";
        ctx.Response.StatusCode = StatusCodes.Status204NoContent;
        return;
    }
    await next();
});

app.MapGet("/state", async () =>
{
    var session = PickSession();
    if (session == null) return Results.Json(new { ok = true, active = false });

    GlobalSystemMediaTransportControlsSessionMediaProperties? props = null;
    try { props = await session.TryGetMediaPropertiesAsync(); } catch { }

    var playback = session.GetPlaybackInfo();
    var timeline = session.GetTimelineProperties();
    var playing = playback?.PlaybackStatus ==
                  GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;

    var position = timeline.Position.TotalSeconds;
    if (playing && timeline.LastUpdatedTime.Year > 2000)
    {
        var elapsed = (DateTimeOffset.Now - timeline.LastUpdatedTime).TotalSeconds;
        var rate = playback?.PlaybackRate ?? 1.0;
        if (elapsed is > 0 and < 3600) position += elapsed * rate;
    }
    var duration = (timeline.EndTime - timeline.StartTime).TotalSeconds;
    if (duration > 0) position = Math.Clamp(position, 0, duration);

    var title = props?.Title ?? "";
    var artist = props?.Artist ?? "";
    var album = props?.AlbumTitle ?? "";
    var artId = await art.UpdateAsync(props, $"{session.SourceAppUserModelId}|{title}|{artist}|{album}");

    var controls = playback?.Controls;
    return Results.Json(new
    {
        ok = true,
        active = true,
        app = AppName(session.SourceAppUserModelId),
        appId = session.SourceAppUserModelId,
        title,
        artist,
        album,
        playing,
        position,
        duration,
        artId,
        canNext = controls?.IsNextEnabled ?? false,
        canPrev = controls?.IsPreviousEnabled ?? false,
        canSeek = controls?.IsPlaybackPositionEnabled ?? false,
    });
});

app.MapGet("/art/{id}", (string id) =>
    art.Id == id && art.Bytes != null
        ? Results.Bytes(art.Bytes, art.ContentType)
        : Results.NotFound());

app.MapPost("/cmd/{action}", async (string action) =>
{
    var session = PickSession();
    if (session == null) return Results.NotFound();
    var ok = action switch
    {
        "toggle" => await session.TryTogglePlayPauseAsync(),
        "play" => await session.TryPlayAsync(),
        "pause" => await session.TryPauseAsync(),
        "next" => await session.TrySkipNextAsync(),
        "prev" => await session.TrySkipPreviousAsync(),
        _ => false,
    };
    return Results.Json(new { ok });
});

app.MapPost("/seek", async (double pos) =>
{
    var session = PickSession();
    if (session == null) return Results.NotFound();
    var ok = await session.TryChangePlaybackPositionAsync(TimeSpan.FromSeconds(pos).Ticks);
    return Results.Json(new { ok });
});

// Live spectrum of the system audio: { b: [28 values 0..1] }
app.MapGet("/bands", () => Results.Json(new { b = spectrum.Read() }));

// Listening summary for the new tab: GET /stats?days=7
app.MapGet("/stats", (int? days) => Results.Json(stats.Summary(Math.Clamp(days ?? 7, 1, 90))));

// The current Windows desktop wallpaper (for theme colors / new tab)
app.MapGet("/wallpaper", () =>
{
    string? path = null;
    try
    {
        using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Control Panel\Desktop");
        path = key?.GetValue("WallPaper") as string;
    }
    catch { }
    var transcoded = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"Microsoft\Windows\Themes\TranscodedWallpaper");
    if (string.IsNullOrEmpty(path) || !File.Exists(path)) path = File.Exists(transcoded) ? transcoded : null;
    if (path == null) return Results.NotFound();
    var ext = Path.GetExtension(path).ToLowerInvariant();
    var type = ext == ".png" ? "image/png" : ext == ".webp" ? "image/webp" : "image/jpeg";
    return Results.File(path, type, enableRangeProcessing: false, lastModified: File.GetLastWriteTimeUtc(path));
});

// Favicons with CORS, so the new tab can read their pixels: GET /favicon?host=github.com
var favHttp = new HttpClient { Timeout = TimeSpan.FromSeconds(6) };
favHttp.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 NebulaBridge");
var favCache = new System.Collections.Concurrent.ConcurrentDictionary<string, (byte[] data, string type)>();
app.MapGet("/favicon", async (string host) =>
{
    host = host.Trim().ToLowerInvariant();
    if (host.Length == 0 || host.Length > 200 || host.Any(c => !(char.IsLetterOrDigit(c) || c == '.' || c == '-')))
        return Results.BadRequest();
    if (favCache.TryGetValue(host, out var hit)) return Results.File(hit.data, hit.type);
    foreach (var url in new[] { $"https://www.google.com/s2/favicons?domain={host}&sz=128", $"https://icons.duckduckgo.com/ip3/{host}.ico" })
    {
        try
        {
            using var res = await favHttp.GetAsync(url);
            if (!res.IsSuccessStatusCode) continue;
            var data = await res.Content.ReadAsByteArrayAsync();
            if (data.Length < 100) continue;
            var type = res.Content.Headers.ContentType?.MediaType ?? "image/png";
            favCache[host] = (data, type);
            return Results.File(data, type);
        }
        catch { }
    }
    return Results.NotFound();
});

app.MapGet("/debug/requests", () => Results.Text(string.Join('\n', recent)));

app.MapGet("/", () => Results.Text("Nebula Bridge is running."));

app.Run();

class ArtCache
{
    private string? _key;
    private DateTime _lastTry;
    public string? Id { get; private set; }
    public byte[]? Bytes { get; private set; }
    public string ContentType { get; private set; } = "image/jpeg";

    public async Task<string?> UpdateAsync(
        GlobalSystemMediaTransportControlsSessionMediaProperties? props, string key)
    {
        // Players often publish the thumbnail a moment after the title, so a
        // track without art is retried (at most every 2 seconds).
        if (key == _key && (Id != null || DateTime.UtcNow - _lastTry < TimeSpan.FromSeconds(2))) return Id;
        _key = key;
        _lastTry = DateTime.UtcNow;
        Id = null;
        Bytes = null;
        if (props?.Thumbnail == null) return null;

        try
        {
            using var stream = await props.Thumbnail.OpenReadAsync();
            var buffer = new byte[stream.Size];
            using var reader = new DataReader(stream);
            await reader.LoadAsync((uint)stream.Size);
            reader.ReadBytes(buffer);
            Bytes = buffer;
            ContentType = string.IsNullOrEmpty(stream.ContentType) ? "image/jpeg" : stream.ContentType;
            Id = Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(key)))[..16].ToLowerInvariant();
        }
        catch
        {
            Id = null;
        }
        return Id;
    }
}
