import { describe, it, expect } from 'vitest';
import {
  detectPlatform,
  formatBytes,
  formatReleaseDate,
  pickAssetFor,
  pickInstallAssetFor,
  summarizeNotes,
} from '../../src/app/core/utils/release.util';
import type { ReleaseAsset } from '../../src/app/core/models/update.model';

function asset(name: string, size = 1024): ReleaseAsset {
  return { name, size, downloadUrl: `https://example.com/${name}` };
}

describe('detectPlatform', () => {
  it('recognises the three platforms the app ships installers for', () => {
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('macos');
    expect(detectPlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
  });

  it('does not mistake a phone for a desktop', () => {
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('unknown');
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(
      'unknown',
    );
    expect(detectPlatform('')).toBe('unknown');
  });
});

describe('pickAssetFor', () => {
  const releaseAssets = [
    asset('deepwork-mac-arm-portable'),
    asset('deepwork-mac-portable'),
    asset('DeepWork_1.0.0_aarch64.dmg'),
    asset('DeepWork_1.0.0_x64-setup.exe'),
    asset('DeepWork_1.0.0_x64.dmg'),
  ];

  it('finds the Windows installer', () => {
    expect(pickAssetFor(releaseAssets, 'windows')?.name).toBe('DeepWork_1.0.0_x64-setup.exe');
  });

  it('prefers the build that runs on every Mac', () => {
    expect(pickAssetFor(releaseAssets, 'macos')?.name).toBe('DeepWork_1.0.0_x64.dmg');
  });

  it('finds a Linux package by its extension', () => {
    const linux = [asset('DeepWork_1.0.0_amd64.deb'), asset('DeepWork_1.0.0_x64.AppImage')];
    expect(pickAssetFor(linux, 'linux')?.name).toBe('DeepWork_1.0.0_x64.AppImage');
  });

  it('returns nothing rather than a wrong file', () => {
    expect(pickAssetFor(releaseAssets, 'linux')).toBeNull();
    expect(pickAssetFor(releaseAssets, 'unknown')).toBeNull();
    expect(pickAssetFor([], 'windows')).toBeNull();
  });
});

describe('pickInstallAssetFor', () => {
  it('picks what the system itself can install', () => {
    const linux = [asset('DeepWork_2.1.0_x64.AppImage'), asset('DeepWork_2.1.0_amd64.deb')];
    expect(pickInstallAssetFor(linux, 'linux')?.name).toBe('DeepWork_2.1.0_amd64.deb');

    const windows = [asset('DeepWork_2.1.0_x64.msi'), asset('DeepWork_2.1.0_x64-setup.exe')];
    expect(pickInstallAssetFor(windows, 'windows')?.name).toBe('DeepWork_2.1.0_x64-setup.exe');
  });

  it('still finds a portable build when that is all there is', () => {
    const linux = [asset('DeepWork_2.1.0_x64.AppImage')];
    expect(pickInstallAssetFor(linux, 'linux')?.name).toBe('DeepWork_2.1.0_x64.AppImage');

    const macos = [asset('DeepWork_2.1.0_aarch64.dmg')];
    expect(pickInstallAssetFor(macos, 'macos')?.name).toBe('DeepWork_2.1.0_aarch64.dmg');
  });

  it('returns nothing when the release carries nothing for this platform', () => {
    const windowsOnly = [asset('DeepWork_2.1.0_x64-setup.exe')];
    expect(pickInstallAssetFor(windowsOnly, 'linux')).toBeNull();
    expect(pickInstallAssetFor(windowsOnly, 'unknown')).toBeNull();
    expect(pickInstallAssetFor([], 'macos')).toBeNull();
  });
});

describe('formatBytes', () => {
  it('writes sizes the way a download page does', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(2072863)).toBe('2 MB');
    expect(formatBytes(3_221_236)).toBe('3.1 MB');
    expect(formatBytes(Number.NaN)).toBe('0 B');
    expect(formatBytes(-5)).toBe('0 B');
  });
});

describe('formatReleaseDate', () => {
  it('writes the date in UTC, so it reads the same everywhere', () => {
    expect(formatReleaseDate('2026-05-27T09:18:02Z')).toBe('27 May 2026');
    expect(formatReleaseDate('2026-01-01T00:30:00Z')).toBe('1 January 2026');
  });

  it('returns nothing for a date it cannot read', () => {
    expect(formatReleaseDate(null)).toBe('');
    expect(formatReleaseDate('')).toBe('');
    expect(formatReleaseDate('not a date')).toBe('');
  });
});

describe('summarizeNotes', () => {
  it('turns release notes into readable text', () => {
    const notes = '# Deep Work v1.0.0\n\n**Focus**\n\n- Pomodoro timer\n- `Deep work` sessions';
    expect(summarizeNotes(notes)).toBe(
      'Deep Work v1.0.0\n\nFocus\n\n• Pomodoro timer\n• Deep work sessions',
    );
  });

  it('shortens long notes on a word boundary', () => {
    const notes = new Array(60).fill('a sentence about the release').join(' ');
    const summary = summarizeNotes(notes, 100);

    expect(summary.length).toBeLessThanOrEqual(101);
    expect(summary.endsWith('…')).toBe(true);
    expect(summary).not.toContain('  ');
  });

  it('handles empty notes', () => {
    expect(summarizeNotes('')).toBe('');
    expect(summarizeNotes('\n\n\n')).toBe('');
  });
});
