/// <reference lib="webworker" />

/**
 * Web Worker for notification repeat timer.
 * Workers are NOT throttled when the main window is minimized/background,
 * ensuring notifications fire reliably on all platforms.
 */

let intervalId: ReturnType<typeof setInterval> | null = null;

addEventListener('message', (event: MessageEvent<{ command: string; intervalMs?: number }>) => {
  const { command, intervalMs } = event.data;

  switch (command) {
    case 'start':
      stop();
      if (intervalMs && intervalMs > 0) {
        intervalId = setInterval(() => {
          postMessage({ type: 'tick' });
        }, intervalMs);
      }
      break;
    case 'stop':
      stop();
      break;
  }
});

function stop(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
