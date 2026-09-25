# Feature Specification: Downloads that say where they went, and a task form that remembers today

**Feature branch**: `version3.0`
**Status**: Implemented
**Created**: 2026-09-18

## Summary

Two pieces of everyday friction: a file leaves the app and the user has no idea
where it went, and the same date has to be picked on every new task.

## User Scenarios & Testing

### Primary stories

1. **Download the Excel template.** The user presses *Download template*; a message
   confirms it and names the folder (and, in the desktop app, the full path).
2. **Export the task list.** The same happens after a CSV export — the panel and a
   toast both state where the file was written.
3. **Find the file again.** Nothing is silently overwritten: a second export on the
   same day becomes `export-2026-09-18 (2).csv`, and its path is reported too.
4. **Add a task for today.** The add-task form opens with today's date already in
   **Deadline**; the user can move it to a later day or clear it.

### Acceptance criteria

- **AC-1** In the desktop app, both downloads are written by the app into the real
  Downloads folder, and the user is told the folder and the full path.
- **AC-2** The Downloads folder honours a custom location (Explorer's recorded path
  on Windows).
- **AC-3** An existing file is never overwritten; the next name is used and reported.
- **AC-4** In the browser/PWA build the download still happens, and the message names
  the browser's download folder rather than a path the browser never revealed.
- **AC-5** The CSV bytes are unchanged from the previous library-produced output
  (verbatim header carrying the UTF-8 BOM, every data cell quoted, CRLF rows).
- **AC-6** A native write failure degrades to the browser download instead of losing
  the file.
- **AC-7** The add-task form defaults **Deadline** to today, in the user's own
  timezone, and the date validator accepts today as well as later days.
- **AC-8** Clearing the deadline still saves the task with no deadline.

### Out of scope

- A "Save as…" dialog: the point is that the app knows and states where the file
  went, not that the user picks the location.
- Cleaning up the old exports from Downloads.

## Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | `downloads.rs` resolves the Downloads folder (Windows registry `Shell Folders`, `$XDG_DOWNLOAD_DIR`, `~/Downloads`), sanitises the file name, and de-duplicates it. |
| FR-2 | Rust command `save_download(file_name, bytes) -> path`. |
| FR-3 | `DownloadService.save()` writes through Rust in the desktop app and falls back to a blob download in the browser, returning `SavedDownload { fileName, folder, location }`. |
| FR-4 | `DownloadService.describe()` is the single wording for "where did it go", used by the import panel, the export panel and their toasts. |
| FR-5 | `buildCsvContent()` + `exportColumnsWithBom()` in `task-export.util.ts` reproduce the previous CSV output exactly. |
| FR-6 | `createTaskFormDefaults()` pre-fills `deadline` with the local date. |
| FR-7 | `futureDate` accepts today and compares `YYYY-MM-DD` strings. |

## Key entities

- **SavedDownload** — `{ fileName, folder, location }`; `location` is null when the
  browser owns the destination.

## Success criteria

- All unit tests pass (415 tests / 35 files).
- `ng build` and `cargo check` are clean.

## Assumptions

- Writing into Downloads silently (and reporting it) is better than a save dialog for
  a template or a routine export.
- Today is the useful default deadline; users who want "no deadline" clear the field,
  exactly as before.
