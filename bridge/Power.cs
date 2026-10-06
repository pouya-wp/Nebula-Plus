// Battery / charger state and whole-machine CPU load, for Nebula Plus'
// automatic lean mode (lighter effects on battery or when the CPU is busy).
using System.Runtime.InteropServices;

namespace NebulaBridge;

public static class Power
{
    [StructLayout(LayoutKind.Sequential)]
    struct SYSTEM_POWER_STATUS
    {
        public byte ACLineStatus, BatteryFlag, BatteryLifePercent, SystemStatusFlag;
        public int BatteryLifeTime, BatteryFullLifeTime;
    }

    [DllImport("kernel32.dll")]
    static extern bool GetSystemPowerStatus(out SYSTEM_POWER_STATUS status);

    [DllImport("kernel32.dll")]
    static extern bool GetSystemTimes(out long idle, out long kernel, out long user);

    static long lastIdle, lastTotal;

    // CPU busy % since the previous call (first call: since boot)
    static double Cpu()
    {
        if (!GetSystemTimes(out var idle, out var kernel, out var user)) return -1;
        long total = kernel + user; // kernel time includes idle
        long dTotal = total - lastTotal, dIdle = idle - lastIdle;
        lastTotal = total;
        lastIdle = idle;
        return dTotal <= 0 ? -1 : Math.Round(100.0 * (dTotal - dIdle) / dTotal, 1);
    }

    public static object Read()
    {
        GetSystemPowerStatus(out var s);
        bool hasBattery = s.BatteryFlag != 128 && s.BatteryFlag != 255;
        return new
        {
            ac = s.ACLineStatus == 1,
            battery = hasBattery && s.BatteryLifePercent <= 100 ? s.BatteryLifePercent : -1,
            saver = s.SystemStatusFlag == 1,
            cpu = Cpu(),
        };
    }
}
