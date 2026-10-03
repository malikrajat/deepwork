import { describe, it, expect } from 'vitest';
import {
  compareVersions,
  formatVersion,
  isNewerVersion,
  parseVersion,
} from '../../src/app/core/utils/version.util';

describe('parseVersion', () => {
  it('reads the three numbers, with or without a v prefix', () => {
    expect(parseVersion('v1.2.3')).toMatchObject({ major: 1, minor: 2, patch: 3 });
    expect(parseVersion('2.0.0')).toMatchObject({ major: 2, minor: 0, patch: 0 });
    expect(parseVersion('  v10.4.1  ')).toMatchObject({
      major: 10,
      minor: 4,
      patch: 1,
      raw: 'v10.4.1',
    });
  });

  it('fills in missing parts, so "1" and "1.0.0" agree', () => {
    expect(parseVersion('1')).toMatchObject({ major: 1, minor: 0, patch: 0 });
    expect(parseVersion('1.5')).toMatchObject({ major: 1, minor: 5, patch: 0 });
  });

  it('keeps the pre-release tag and ignores build metadata', () => {
    expect(parseVersion('2.0.0-beta.1')?.prerelease).toBe('beta.1');
    expect(parseVersion('2.0.0+build.9')?.prerelease).toBeNull();
  });

  it('refuses anything that is not a version', () => {
    expect(parseVersion('latest')).toBeNull();
    expect(parseVersion('v')).toBeNull();
    expect(parseVersion('')).toBeNull();
    expect(parseVersion(null)).toBeNull();
    expect(parseVersion(undefined)).toBeNull();
  });
});

describe('compareVersions', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('treats a release as newer than its own pre-releases', () => {
    expect(compareVersions('1.0.0', '1.0.0-beta.1')).toBe(1);
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1);
  });

  it('orders pre-releases between themselves', () => {
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.10')).toBe(-1);
    expect(compareVersions('1.0.0-beta.1', '1.0.0-alpha.1')).toBe(1);
    expect(compareVersions('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1);
    expect(compareVersions('1.0.0-beta', '1.0.0-beta')).toBe(0);
  });

  it('has no opinion about something it cannot read', () => {
    expect(compareVersions('nightly', '1.0.0')).toBeNull();
    expect(compareVersions('1.0.0', '')).toBeNull();
  });
});

describe('isNewerVersion', () => {
  it('is true only for something genuinely newer', () => {
    expect(isNewerVersion('1.0.1', '1.0.0')).toBe(true);
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
    expect(isNewerVersion('0.9.0', '1.0.0')).toBe(false);
  });

  it('says no rather than guessing when a version is unreadable', () => {
    expect(isNewerVersion('not-a-version', '1.0.0')).toBe(false);
  });
});

describe('formatVersion', () => {
  it('prefixes the version the way releases are tagged', () => {
    expect(formatVersion('1.0.0')).toBe('v1.0.0');
    expect(formatVersion('v2.0.0')).toBe('v2.0.0');
    expect(formatVersion('  v3.1 ')).toBe('v3.1');
  });

  it('leaves text it cannot read as it found it', () => {
    expect(formatVersion('unknown')).toBe('unknown');
    expect(formatVersion(null)).toBe('');
  });
});
