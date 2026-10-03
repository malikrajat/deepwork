import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DownloadService } from '../../src/app/core/services/download.service';

/**
 * The service exists so the app can answer "where did my file go?".
 *
 * The desktop path (Rust writes the file and returns the real path) is covered by
 * the command itself; what is checked here is the browser half — it must still
 * produce a download, and it must describe it honestly instead of inventing a
 * path the browser never revealed.
 */
describe('DownloadService (browser build)', () => {
  let service: DownloadService;
  let createdUrls: string[];
  let clickedNames: string[];

  beforeEach(() => {
    TestBed.resetTestingModule();
    createdUrls = [];
    clickedNames = [];

    // jsdom has neither of these.
    URL.createObjectURL = vi.fn(() => {
      const url = `blob:deepwork/${createdUrls.length}`;
      createdUrls.push(url);
      return url;
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clickedNames.push(this.download);
    });

    TestBed.configureTestingModule({ providers: [DownloadService] });
    service = TestBed.inject(DownloadService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('reports that it cannot name the exact location outside the desktop app', () => {
    expect(service.isDesktopApp).toBe(false);
  });

  it('downloads the file and names the folder the browser uses', async () => {
    const saved = await service.save('tasks.csv', 'a,b\r\n', 'text/csv;charset=utf-8;');

    expect(clickedNames).toEqual(['tasks.csv']);
    expect(createdUrls).toHaveLength(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(createdUrls[0]);
    expect(saved).toEqual({ fileName: 'tasks.csv', folder: 'Downloads', location: null });
  });

  it('describes a browser download without inventing a path', () => {
    const text = service.describe({ fileName: 'tasks.csv', folder: 'Downloads', location: null });
    expect(text).toContain('tasks.csv');
    expect(text).toContain('download folder');
    expect(text).not.toContain(':\\');
  });

  it('names the folder and the full path when the desktop app wrote the file', () => {
    const text = service.describe({
      fileName: 'tasks.csv',
      folder: 'Downloads',
      location: 'C:\\Users\\Ada\\Downloads\\tasks.csv',
    });
    expect(text).toContain('Downloads folder');
    expect(text).toContain('C:\\Users\\Ada\\Downloads\\tasks.csv');
  });
});
