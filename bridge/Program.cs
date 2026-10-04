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

app.Use(async (ctx, next) =>
{
    ctx.Response.Headers["Access-Control-Allow-Origin"] = "*";
    ctx.Response.Headers["Cache-Control"] = "no-store";
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
