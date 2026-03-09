# TODO

## Consolidate Reader Components

The reader UI is implemented twice — once in the GUI (`packages/gui/src/lib/components/reader/`) and once as a standalone SPA (`packages/core/reader/`). The TUI launches the standalone SPA in a browser. These are near-identical Svelte components that were copy-pasted rather than shared. Any reader feature or bugfix currently needs to be applied in both places.

Consolidate into a single shared implementation.

## Remote Server Mode

Replace SMB share support with the ability to run OMO as a remotely accessible server. Currently, SMB allows reading from a local NAS, but only works on the same network. Instead, OMO's core HTTP server should be runnable on the NAS itself, serving the GUI SPA and API so the app can be accessed remotely via IP and port from anywhere.

## Collection Grouping in Library

Improve collections so they can aggregate loose titles by author (e.g. all of Akira Toriyama's works) or franchise (e.g. JoJo and its spinoffs) and display them as grouped entries within the library. Add a setting in Settings with three display modes:

- **Show collections in library** (default) — collections appear as grouped items alongside ungrouped series
- **Show collections alongside individual items** — collection contents are shown inline, ungrouped, next to standalone series
- **Hide collections from library** — collections only appear on the dedicated Collections navigation page

This allows organized libraries where, for example, all of Toriyama's works sit together as a group next to standalone series like FLCL or Chainsaw Man.

## Reading Tracker Start/Stop

Add the ability to toggle tracking on/off per series so users control when their progress timer is running. Without this, pausing a series for months then resuming skews the tracking data (time-to-complete, reading pace, etc.).

- Users can start/stop tracking for any series at will, so breaks don't count against reading time
- When a series is completed (all chapters read), auto-complete the tracking session — no prompt needed, just stop the timer automatically
- Tracking state should be visible on the work detail page (active/paused indicator, total tracked time)
