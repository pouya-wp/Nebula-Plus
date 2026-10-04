// Listening history for the new tab's "this week" card.
// Every few seconds of playback are added to the track that is playing and
// saved to %APPDATA%\NebulaBridge\listening.json (one entry per day/track).

using System.Text.Json;

namespace NebulaBridge;

public sealed class ListeningStats
{
    private readonly string _path;
    private readonly object _lock = new();
    private readonly Dictionary<string, Entry> _entries;
    private DateTime _lastSave = DateTime.UtcNow;

    public sealed class Entry
    {
        public string Day { get; set; } = "";
        public string Title { get; set; } = "";
        public string Artist { get; set; } = "";
        public double Seconds { get; set; }
    }

    public ListeningStats()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "NebulaBridge");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "listening.json");
        _entries = new();
        try
        {
            if (File.Exists(_path))
            {
                var list = JsonSerializer.Deserialize<List<Entry>>(File.ReadAllText(_path)) ?? new();
                foreach (var e in list) _entries[Key(e.Day, e.Title, e.Artist)] = e;
            }
        }
        catch { }
    }

    private static string Key(string day, string title, string artist) => $"{day}|{title}|{artist}";

    public void Add(string title, string artist, double seconds)
    {
        if (string.IsNullOrWhiteSpace(title) || seconds <= 0 || seconds > 30) return;
        var day = DateTime.Now.ToString("yyyy-MM-dd");
        lock (_lock)
        {
            var key = Key(day, title, artist);
            if (!_entries.TryGetValue(key, out var e))
                _entries[key] = e = new Entry { Day = day, Title = title, Artist = artist };
            e.Seconds += seconds;
            if (DateTime.UtcNow - _lastSave > TimeSpan.FromSeconds(30)) Save();
        }
    }

    private void Save()
    {
        _lastSave = DateTime.UtcNow;
        try
        {
            // keep ~90 days
            var cutoff = DateTime.Now.AddDays(-90).ToString("yyyy-MM-dd");
            var list = _entries.Values.Where(e => string.CompareOrdinal(e.Day, cutoff) >= 0).ToList();
            File.WriteAllText(_path, JsonSerializer.Serialize(list));
        }
        catch { }
    }

    public object Summary(int days)
    {
        var from = DateTime.Now.AddDays(-(days - 1)).ToString("yyyy-MM-dd");
        List<Entry> list;
        lock (_lock) list = _entries.Values.Where(e => string.CompareOrdinal(e.Day, from) >= 0).ToList();

        // a track title with several artists ("A & B") counts for each
        var artists = list
            .SelectMany(e => e.Artist.Split(new[] { " & ", ", ", " feat. ", " ft. " }, StringSplitOptions.RemoveEmptyEntries)
                .Select(a => (artist: a.Trim(), e.Seconds)))
            .GroupBy(x => x.artist)
            .Select(g => new { name = g.Key, minutes = Math.Round(g.Sum(x => x.Seconds) / 60) })
            .OrderByDescending(a => a.minutes).Take(3).ToList();
        var tracks = list
            .GroupBy(e => (e.Title, e.Artist))
            .Select(g => new { title = g.Key.Title, artist = g.Key.Artist, minutes = Math.Round(g.Sum(x => x.Seconds) / 60) })
            .OrderByDescending(t => t.minutes).Take(3).ToList();
        var perDay = Enumerable.Range(0, days)
            .Select(i => DateTime.Now.AddDays(-(days - 1 - i)).ToString("yyyy-MM-dd"))
            .Select(d => Math.Round(list.Where(e => e.Day == d).Sum(e => e.Seconds) / 60))
            .ToList();
        return new
        {
            days,
            minutes = Math.Round(list.Sum(e => e.Seconds) / 60),
            artists,
            tracks,
            perDay,
        };
    }
}
