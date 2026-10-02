import { Injectable } from '@angular/core';
import { SavedDownload } from '../models/download.model';

/** True when running inside the packaged desktop app (Tauri). */
const IN_TAURI =
  typeof globalThis !== 'undefined' && '__TAURI_INTERNALS__' in globalThis;

/** What a browser download folder is called when the real one is hidden. */
const BROWSER_DOWNLOAD_FOLDER = 'Downloads';

/**
 * Delivers generated files — the CSV task export and the Excel import template —
 * and tells the user where they landed.
 *
 * A desktop app that only triggers a webview download leaves the user guessing:
 * the file appears somewhere, silently, and "where did my export go?" has no
 * answer. So the desktop build hands the bytes to Rust, which writes them into
 * the real Downloads folder (a custom location included, and never overwriting an
 * existing file) and returns the path. The browser build keeps using an ordinary
 * blob download, because a browser will not reveal its destination.
 */
@Injectable({ providedIn: 'root' })
export class DownloadService {
  /** True when the file location can be reported exactly. */
  readonly isDesktopApp = IN_TAURI;

  /**
   * Writes `content` as `fileName` and reports where it went.
   *
   * @param content UTF-8 text, or raw bytes for a binary format such as `.xlsx`.
   */
  async save(
    fileName: string,
    content: string | Uint8Array,
    mimeType: string
  ): Promise<SavedDownload> {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;

    if (IN_TAURI) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const location = await invoke<string>('save_download', { fileName, bytes });
        return { fileName, folder: folderNameOf(location), location };
      } catch (error) {
        // A failed native write must never cost the user their export: fall
        // through to the webview download and report only what is certain.
        console.warn('save_download unavailable — falling back to a webview download', error);
      }
    }

    triggerBrowserDownload(fileName, bytes, mimeType);
    return { fileName, folder: BROWSER_DOWNLOAD_FOLDER, location: null };
  }

  /** One sentence naming where a file went, shared by every download surface. */
  describe(saved: SavedDownload): string {
    return saved.location
      ? `Saved in the ${saved.folder} folder — ${saved.location}`
      : `Saved as ${saved.fileName} in the browser's download folder`;
  }
}

/** `C:\Users\Ada\Downloads\export.csv` → `Downloads`. */
function folderNameOf(path: string): string {
  const segments = path.split(/[\\/]/).filter(segment => segment.length > 0);
  return segments.length >= 2 ? segments[segments.length - 2] : BROWSER_DOWNLOAD_FOLDER;
}

/** The browser/PWA path: a blob handed to the browser's own download machinery. */
function triggerBrowserDownload(fileName: string, bytes: Uint8Array, mimeType: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.visibility = 'hidden';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
