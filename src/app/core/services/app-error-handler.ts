import { ErrorHandler, Injectable, inject } from '@angular/core';
import { LogService } from './log.service';

/**
 * Where Angular hands the errors its own machinery catches.
 *
 * The default handler prints them and forgets them — which means the one class
 * of failure that is *guaranteed* to be interesting (Angular caught it during a
 * change detection pass) is the one nobody can read afterwards. This one writes
 * it to `crash.log` instead, with the page the user was on.
 */
@Injectable()
export class AppErrorHandler implements ErrorHandler {
  private readonly log = inject(LogService);

  handleError(error: unknown): void {
    const detail = error instanceof Error ? error.stack || error.message : String(error);
    this.log.error('crash', `Angular error: ${detail}`);
  }
}
