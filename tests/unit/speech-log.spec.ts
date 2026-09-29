import { describe, it, expect, beforeEach, vi } from 'vitest';
import { formatSpeechLogLine, speechLog } from '../../src/app/core/services/speech-log';

/**
 * The dictation log is the answer to "it heard nothing, why?" on a machine
 * nobody can attach a debugger to, so it has to survive the three things that
 * happen to it: a long session, a reload, and being copied into a message.
 */

const STORAGE_KEY = 'deepwork.speechLog.v1';

describe('speech log', () => {
  beforeEach(() => {
    speechLog.clear();
    localStorage.removeItem(STORAGE_KEY);
  });

  it('keeps every step of a dictation attempt, oldest first', () => {
    speechLog.info('engine', 'machine can dictate — Windows speech recognition');
    speechLog.warn('session', 'nothing usable arrived in time');

    const entries = speechLog.entries();
    expect(entries.length).toBe(2);
    expect(entries[0].scope).toBe('engine');
    expect(entries[1].level).toBe('warn');
  });

  it('folds a status object into the line, so the engine answer is readable', () => {
    speechLog.info('bridge', 'native_speech_status ←', { available: true, languages: ['en-US'] });

    const [entry] = speechLog.entries();
    expect(entry.message).toContain('"available":true');
    expect(entry.message).toContain('en-US');
  });

  it('copies out as one report with the environment it ran in', () => {
    speechLog.error('session', 'the recognizer stopped');

    const report = speechLog.text();
    expect(report).toContain('DeepWork dictation log');
    expect(report).toContain('runtime:');
    expect(report).toContain('web speech api exposed here:');
    expect(report).toContain('session: the recognizer stopped');
    expect(report).toContain(formatSpeechLogLine(speechLog.entries()[0]));
  });

  it('empties on clear, so one clean test is easy to read', () => {
    speechLog.info('settings', 'diagnostics cleared');

    speechLog.clear();

    expect(speechLog.entries()).toEqual([]);
    expect(speechLog.text()).not.toContain('diagnostics cleared');
  });

  it('keeps the previous run when the app is reloaded', async () => {
    // A dictation attempt that ends in a reload or a restart is exactly the one
    // worth reading, so the buffer is restored instead of starting empty.
    vi.resetModules();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          time: '10:00:00.000',
          age: 1.5,
          level: 'error',
          scope: 'session',
          message: 'Windows is hearing you but produced no words',
        },
      ])
    );

    const fresh = await import('../../src/app/core/services/speech-log');
    const messages = fresh.speechLog.entries().map(entry => entry.message);

    expect(messages.some(message => message.includes('produced no words'))).toBe(true);
    expect(messages.some(message => message.includes('earlier entries kept above'))).toBe(true);
  });
});
