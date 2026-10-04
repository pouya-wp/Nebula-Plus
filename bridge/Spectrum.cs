// Live audio spectrum of what Windows is playing (WASAPI loopback).
// Capture only runs while someone is asking for it: it starts on the first
// request and stops after a few idle seconds, so the bridge costs nothing
// when no visualizer is on screen.

using NAudio.Dsp;
using NAudio.Wave;

namespace NebulaBridge;

public sealed class Spectrum : IDisposable
{
    private const int FftSize = 2048;
    private const int FftLog2 = 11;
    public const int Bands = 28;

    private readonly object _lock = new();
    private readonly float[] _ring = new float[FftSize];
    private int _ringPos;
    private readonly float[] _smooth = new float[Bands];
    private WasapiLoopbackCapture? _capture;
    private int _sampleRate = 48000;
    private DateTime _lastRequest;
    private readonly Timer _idle;

    public Spectrum()
    {
        _idle = new Timer(_ => StopIfIdle(), null, 2000, 2000);
    }

    private void EnsureRunning()
    {
        _lastRequest = DateTime.UtcNow;
        if (_capture != null) return;
        try
        {
            var capture = new WasapiLoopbackCapture();
            _sampleRate = capture.WaveFormat.SampleRate;
            capture.DataAvailable += OnData;
            capture.RecordingStopped += (_, _) => { };
            capture.StartRecording();
            _capture = capture;
        }
        catch
        {
            _capture = null;
        }
    }

    private void StopIfIdle()
    {
        if (_capture == null || DateTime.UtcNow - _lastRequest < TimeSpan.FromSeconds(5)) return;
        try { _capture.StopRecording(); _capture.Dispose(); } catch { }
        _capture = null;
        Array.Clear(_smooth);
    }

    private void OnData(object? sender, WaveInEventArgs e)
    {
        var fmt = _capture?.WaveFormat;
        if (fmt == null) return;
        int channels = fmt.Channels;
        bool isFloat = fmt.Encoding == WaveFormatEncoding.IeeeFloat || fmt.BitsPerSample == 32;
        int bytesPerSample = fmt.BitsPerSample / 8;
        int frame = bytesPerSample * channels;
        lock (_lock)
        {
            for (int i = 0; i + frame <= e.BytesRecorded; i += frame)
            {
                float sum = 0;
                for (int c = 0; c < channels; c++)
                {
                    int at = i + c * bytesPerSample;
                    sum += isFloat
                        ? BitConverter.ToSingle(e.Buffer, at)
                        : BitConverter.ToInt16(e.Buffer, at) / 32768f;
                }
                _ring[_ringPos] = sum / channels;
                _ringPos = (_ringPos + 1) % FftSize;
            }
        }
    }

    // 0..1 per band, log-spaced 40 Hz – 14 kHz, smoothed (fast attack, slow fall).
    public float[] Read()
    {
        EnsureRunning();
        var data = new Complex[FftSize];
        lock (_lock)
        {
            for (int i = 0; i < FftSize; i++)
            {
                float s = _ring[(_ringPos + i) % FftSize];
                float w = 0.5f * (1 - MathF.Cos(2 * MathF.PI * i / (FftSize - 1)));
                data[i].X = s * w;
                data[i].Y = 0;
            }
        }
        FastFourierTransform.FFT(true, FftLog2, data);

        var result = new float[Bands];
        double lo = Math.Log(40), hi = Math.Log(14000);
        double binHz = (double)_sampleRate / FftSize;
        for (int b = 0; b < Bands; b++)
        {
            double f0 = Math.Exp(lo + (hi - lo) * b / Bands);
            double f1 = Math.Exp(lo + (hi - lo) * (b + 1) / Bands);
            int i0 = Math.Max(1, (int)(f0 / binHz));
            int i1 = Math.Max(i0 + 1, (int)(f1 / binHz));
            double peak = 0;
            for (int i = i0; i < i1 && i < FftSize / 2; i++)
            {
                double mag = Math.Sqrt(data[i].X * data[i].X + data[i].Y * data[i].Y);
                peak = Math.Max(peak, mag);
            }
            double db = 20 * Math.Log10(peak + 1e-9);
            // treble is naturally quieter: tilt it up a little
            db += 6.0 * b / Bands;
            float v = (float)Math.Clamp((db + 62) / 52, 0, 1);
            float prev = _smooth[b];
            _smooth[b] = v > prev ? prev + (v - prev) * 0.6f : prev + (v - prev) * 0.18f;
            result[b] = MathF.Round(_smooth[b], 3);
        }
        return result;
    }

    public void Dispose()
    {
        _idle.Dispose();
        try { _capture?.StopRecording(); _capture?.Dispose(); } catch { }
    }
}
