# THE DICTATION KEY FROM ANY APP (Prism Terminal, 2026-10-16; owner: "you can
# start the dictation while not having the app in focus"). A low-level keyboard
# hook (WH_KEYBOARD_LL) in a long-lived Windows PowerShell, like the DWM helper:
# Windows' own global shortcuts cannot see a chord of modifiers alone (Ctrl+Win),
# nor a key held and released. MEASURED (spike, 2026-10-16): 0.3 to 1.2 ms from
# a key to its line here, no CPU at rest, no Defender detection.
#
# PRIVACY: it reads only the keys main names (the dictation binding), says only
# "another key" (never which) while one of them is down, and, only while the
# session picker is open, the digits 1-9 and Esc. Nothing is written anywhere.
#
# stdin (from main):  keys <hex vk> ...   the binding's keys (either side of a modifier)
#                     mask 1|0            mask the Start menu on a Win up after Ctrl+Win
#                     pick 1|0            report and SWALLOW 1-9 and Esc (the picker is open)
#                     quit
# ONE HOOK FOR EVERY COPY OF THE APP (owner, 2026-10-17: "very buggy and
# unresponsive ... i have to press multiple times"). MEASURED: with Stable and
# the installed app both running, both hooks took every press; the second
# copy, with no mic set up, failed in 8 ms and its widget covered the first's.
# So a helper hooks only while it holds a lock file (%TEMP%, opened with no
# sharing; Windows closes it when the helper ends): the first copy started owns
# the key, a later one waits ("waiting") and takes over when the first exits.
# MEASURED: a named Mutex hung the waiting helper for good once the owner
# exited (WaitOne on PowerShell's STA thread); the lock file hands over within
# the 500 ms poll. A down says " f <pid>" when a Prism Terminal window is in
# front, naming the copy (its main process) whose window it is: the words go there.
#
# stdout (to main):   ready / failed / waiting  hooked / could not / another copy owns the key
#                     d <hex vk> [f <pid>] / u <hex vk>   a binding key down (f: a Prism Terminal in front) / up
#                     o                          another key went down while one is held
#                     p <1-9> / x                a digit / Esc, while picking
$src = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
public static class PTKey {
  delegate IntPtr Proc(int n, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, Proc fn, IntPtr mod, uint tid);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int n, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern int GetMessage(out MSG m, IntPtr h, uint a, uint b);
  [DllImport("user32.dll")] static extern bool PostThreadMessage(uint tid, uint msg, IntPtr w, IntPtr l);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string n);
  [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] i, int size);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, uint flags, System.Text.StringBuilder s, ref uint n);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] public struct MSG { public IntPtr h; public uint m; public IntPtr w; public IntPtr l; public uint t; public int x; public int y; }
  [StructLayout(LayoutKind.Sequential)] struct KBD { public ushort vk; public ushort scan; public uint flags; public uint time; public IntPtr extra; }
  [StructLayout(LayoutKind.Explicit, Size = 40)] struct INPUT { [FieldOffset(0)] public uint type; [FieldOffset(8)] public KBD k; }
  static Proc keep; static IntPtr hook; static uint thread;
  static volatile HashSet<int> keys = new HashSet<int>();
  static volatile bool mask, pick;
  static readonly HashSet<int> down = new HashSet<int>();
  static bool winDown, ctrlWithWin;
  const int MASK_VK = 0xE8; // unassigned: what AutoHotkey sends to keep Start shut
  static void Say(string s) { Console.Out.WriteLine(s); Console.Out.Flush(); }
  static IntPtr lastFront; static bool lastWasPT; static uint lastPid;
  // Is the window in front one of Prism Terminal's (any copy: PrismTerminal,
  // PrismTerminalStable)? Kept per window: the hook must answer fast.
  static bool FrontIsPT() {
    IntPtr f = GetForegroundWindow();
    if (f == lastFront) return lastWasPT;
    lastFront = f; lastWasPT = false;
    uint pid; GetWindowThreadProcessId(f, out pid);
    lastPid = pid;
    IntPtr h = OpenProcess(0x1000, false, pid);
    if (h == IntPtr.Zero) return false;
    var sb = new System.Text.StringBuilder(1024); uint n = 1024;
    if (QueryFullProcessImageName(h, 0, sb, ref n)) {
      string name = System.IO.Path.GetFileNameWithoutExtension(sb.ToString());
      lastWasPT = name.StartsWith("PrismTerminal", StringComparison.OrdinalIgnoreCase) && name.IndexOf("Setup", StringComparison.OrdinalIgnoreCase) < 0;
    }
    CloseHandle(h);
    return lastWasPT;
  }
  static bool IsCtrl(int vk) { return vk == 0xA2 || vk == 0xA3 || vk == 0x11; }
  static bool IsWin(int vk) { return vk == 0x5B || vk == 0x5C; }
  static void Mask() {
    var a = new INPUT[2];
    a[0].type = 1; a[0].k.vk = MASK_VK;
    a[1].type = 1; a[1].k.vk = MASK_VK; a[1].k.flags = 2;
    SendInput(2, a, Marshal.SizeOf(typeof(INPUT)));
  }
  static IntPtr Cb(int n, IntPtr w, IntPtr l) {
    if (n >= 0) {
      int vk = Marshal.ReadInt32(l);
      int msg = (int)w;
      bool isDown = msg == 0x100 || msg == 0x104;
      if (vk != MASK_VK) {
        if (IsWin(vk)) {
          if (isDown && !winDown) { winDown = true; ctrlWithWin = down.Contains(0xA2) || down.Contains(0xA3); }
          else if (!isDown) {
            bool used = ctrlWithWin || down.Contains(0xA2) || down.Contains(0xA3);
            winDown = false;
            if (mask && used) Mask();
          }
        } else if (IsCtrl(vk) && isDown && winDown) ctrlWithWin = true;
        if (keys.Contains(vk)) {
          if (isDown) { if (down.Add(vk)) Say("d " + vk.ToString("X2") + (FrontIsPT() ? " f " + lastPid : "")); }
          else { down.Remove(vk); Say("u " + vk.ToString("X2")); }
        } else if (isDown) {
          if (pick && ((vk >= 0x31 && vk <= 0x39) || (vk >= 0x61 && vk <= 0x69))) {
            Say("p " + (vk >= 0x61 ? vk - 0x60 : vk - 0x30));
            return (IntPtr)1;
          }
          if (pick && vk == 0x1B) { Say("x"); return (IntPtr)1; }
          if (down.Count > 0) Say("o");
        } else if (pick && ((vk >= 0x31 && vk <= 0x39) || (vk >= 0x61 && vk <= 0x69) || vk == 0x1B)) {
          return (IntPtr)1;
        }
      }
    }
    return CallNextHookEx(hook, n, w, l);
  }
  static void Read() {
    string line;
    while ((line = Console.In.ReadLine()) != null) {
      var p = line.Trim().Split(' ');
      if (p[0] == "keys") {
        var k = new HashSet<int>();
        for (int i = 1; i < p.Length; i++) { int v; if (int.TryParse(p[i], System.Globalization.NumberStyles.HexNumber, null, out v)) k.Add(v); }
        keys = k;
      } else if (p[0] == "mask") mask = p.Length > 1 && p[1] == "1";
      else if (p[0] == "pick") pick = p.Length > 1 && p[1] == "1";
      else if (p[0] == "quit") break;
    }
    // stdin closed or quit: the app is gone, and so is the hook (and the
    // mutex, which the next copy's helper is waiting on).
    Environment.Exit(0);
  }
  static System.IO.FileStream owner;
  static bool Take() {
    try {
      owner = new System.IO.FileStream(System.IO.Path.Combine(System.IO.Path.GetTempPath(), "PrismTerminal-dictation-key.lock"),
        System.IO.FileMode.OpenOrCreate, System.IO.FileAccess.ReadWrite, System.IO.FileShare.None);
      return true;
    } catch (System.IO.IOException) { return false; }
  }
  public static void Run() {
    thread = GetCurrentThreadId();
    var t = new Thread(Read); t.IsBackground = true; t.Start();
    if (!Take()) { Say("waiting"); while (!Take()) Thread.Sleep(500); }
    keep = Cb;
    hook = SetWindowsHookEx(13, keep, GetModuleHandle(null), 0);
    Say(hook != IntPtr.Zero ? "ready" : "failed");
    MSG m; while (GetMessage(out m, IntPtr.Zero, 0, 0) > 0) { }
  }
}
'@
Add-Type -TypeDefinition $src
[PTKey]::Run()
