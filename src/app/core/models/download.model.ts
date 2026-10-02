/** Where a generated file went after the user asked to download it. */
export interface SavedDownload {
  /** Name the file was saved as. */
  fileName: string;
  /** Folder it landed in, e.g. `Downloads`. */
  folder: string;
  /**
   * Full path of the written file.
   *
   * Only the desktop app can report this: it writes the file itself. A browser
   * owns its download destination and never reveals it, so `location` is null
   * there and the UI says "your download folder" instead.
   */
  location: string | null;
}
