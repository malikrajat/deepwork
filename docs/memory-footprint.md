# Where DeepWork's memory goes

Written after the question "it shows 92 MB — can that be reduced?", and measured
on the machine where it was asked: Windows 11, DeepWork 2.3.0, the window open
on the Dashboard with the usual data in it.

## The measurement

Eight processes, one app:

| Process                      | Working set | Private | What it is                                                            |
| ---------------------------- | ----------- | ------- | --------------------------------------------------------------------- |
| `deepwork.exe`               | 14.2 MB     | 6.8 MB  | the app itself: Rust, the tray, SQLite, the timer                     |
| `msedgewebview2` (browser)   | 49.5 MB     | 39.8 MB | Chromium's control process                                            |
| `msedgewebview2` (GPU)       | 41.9 MB     | 70.2 MB | rasterising the UI — the glass and its blurred surfaces live here     |
| `msedgewebview2` (renderer)  | 75.0 MB     | 57.1 MB | the Angular app: JavaScript heap, DOM, stylesheets                    |
| 4 × utility + crash handler  | ~30 MB      | ~36 MB  | network, storage, audio and crash reporting                           |

**The app is the 14 MB line. Everything else is Chromium.** A Tauri window *is* a
WebView2 window, which is a Chromium — browser process, GPU process, renderer,
and the utility processes it starts for networking, storage and audio. That is the
floor a WebView2 app stands on, and it is why the number does not fall much
however lean the application code is: the JavaScript heap of a page like this one
is a few megabytes, and the renderer holding it is 57 MB.

Task Manager reports a smaller figure (~90 MB) than the sum of the working sets
above because it shows each process's *private* working set and groups the ones
it knows belong together; the working-set column double-counts the shared
Chromium pages that every WebView2 app on the machine has loaded once.

## What the app already does

Measured rather than assumed, because "make the routes lazy" was the first
suggestion and it was already true:

- **Every route is lazy.** All eleven entries in `app.routes.ts` use
  `loadComponent` with a dynamic import; nothing but `app.routes.ts` references a
  page at all.
- **The initial bundle is 68 kB** and does not contain the pages: the matrix
  page's own strings ("Eisenhower") are absent from it, and there are 40+ chunks
  beside it that load as they are visited. What a reader sees in a build log is
  the *list* of chunks, which reads like everything loading at once.
- **No service worker in the desktop build.** `index.html` registers one only
  outside Tauri.
- **The frontend log is bounded**: 300 entries, repeats folded, 4,000 characters
  per line, so a long session cannot grow it without limit.
- **Nothing renders per frame.** No `requestAnimationFrame` loops anywhere in
  `src/`; motion is CSS, the clocks are `setInterval`, and the timer's interval
  only exists while a session is running.
- **No large images**: the biggest asset in the build is a 71 kB icon.

## What 2.3.1 changed

**The webview is told to let go while the window is in the tray.** WebView2
exposes `ICoreWebView2_19::SetMemoryUsageTargetLevel`, and the app now asks for
`LOW` when the window is hidden (close to tray, or the fallback that parks a
stranded minimise) and `NORMAL` again when it is restored — see
`set_webview_memory_target` in `src-tauri/src/lib.rs`.

Two properties make that safe:

- **It is a hint, not a suspension.** `TrySuspend` would stop the page's scripts
  as well, and a timer that stops counting when the window is closed to the tray
  is not the timer DeepWork promises.
- **It is best effort by construction.** A runtime older than
  `ICoreWebView2_19`, a window that has gone, and a refused call all do nothing;
  nothing in the app depends on it having worked.

This is the tray half of the picture. It cannot move the number seen while the
window is open, because that number is mostly the GPU and renderer processes
doing their job.

## What 2.0.15 changed

- **The two web fonts are shipped, not fetched.** The app used to reach
  `fonts.googleapis.com` on every start; the four subset files now live in
  `src/fonts/` and travel with the build. No memory is saved — this is the
  offline-and-privacy half of "works on every machine", and it is the one row of
  the table below that has been taken.
- **The inspector is gone from the packaged app.** The `devtools` cargo feature
  was the switch that carried it into a release build; removing it takes the
  inspect entries (and any devtools process state that comes with them) out of
  the shipped app while leaving `tauri dev` alone.

## The levers not taken, and their price

| Lever                                                              | What it would save                                              | What it costs                                                                                                                                          |
| ------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--enable-low-end-device-mode` in `additionalBrowserArgs`           | tens of MB (browser + GPU)                                       | Smaller raster tiles and a smaller cache budget: the crispness work (`docs/visual-crispness`, whole-pixel type, blur-free shapes) is the first thing to soften |
| Fewer or smaller `backdrop-filter` surfaces                          | The GPU process — 42 MB working, 70 MB private, the biggest line | The glass look itself                                                                                                                                   |
| `TrySuspend` while hidden                                           | Most of the renderer                                             | Scripts stop: the tray timer, the water reminder and the notification repeats stop with them. Rejected on purpose                                       |
| **Quit on close** (Desktop Behaviour)                                | All of it — the app is gone                                      | No tray icon, no reminders, no timer between sessions; it is already a setting the user can choose                                                       |
| A native toolkit (GPUI, egui, Slint) instead of a webview            | The whole Chromium floor: ~20-40 MB                              | A rewrite of the frontend                                                                                                                                 |

The honest summary: **~90 MB is what this shape of app costs**, and the parts of
it that are DeepWork's own are the smallest; the parts that are Chromium are
doing the rendering everyone likes. A certificate and a checksum aside, the
cheapest real win left is the tray hint above, and the next one is a decision
about the glass rather than a line of code.

## Measuring it again

```powershell
# Every process of the running app, with what each one holds.
$all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine
$root = $all | Where-Object { $_.Name -eq 'deepwork.exe' } | Select-Object -First 1
$queue = [System.Collections.Generic.Queue[int]]::new(); $queue.Enqueue([int]$root.ProcessId)
$list = @($root)
while ($queue.Count -gt 0) {
  $parent = $queue.Dequeue()
  foreach ($child in $all | Where-Object { $_.ParentProcessId -eq $parent }) {
    $list += $child; $queue.Enqueue([int]$child.ProcessId)
  }
}
$list | ForEach-Object {
  $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
  if ($p) {
    [pscustomobject]@{
      Process = $_.Name
      Type    = if ($_.CommandLine -match '--type=([a-z-]+)') { $Matches[1] } else { 'app' }
      Working = [math]::Round($p.WorkingSet64 / 1MB, 1)
      Private = [math]::Round($p.PrivateMemorySize64 / 1MB, 1)
    }
  }
}
```
