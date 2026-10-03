import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { AppErrorHandler } from './core/services/app-error-handler';
import { DbService } from './core/services/db.service';
import { LogService } from './core/services/log.service';
import { SettingsService } from './core/services/settings.service';
import { ThemeService } from './core/services/theme.service';
import { TrayMenuService } from './core/services/tray-menu.service';
import { DesktopPrefsService } from './core/services/desktop-prefs.service';
import { UiService } from './core/services/ui.service';
import { ScheduleService } from './core/services/schedule.service';
import { WaterReminderService } from './core/services/water-reminder.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Anything Angular catches goes to `crash.log` rather than only the console.
    { provide: ErrorHandler, useClass: AppErrorHandler },
    provideRouter(routes),
    // `provideAppInitializer` replaced the `APP_INITIALIZER` token in Angular 22;
    // the callback runs in an injection context, so `inject()` replaces `deps`.
    provideAppInitializer(async () => {
      const log = inject(LogService);
      const db = inject(DbService);
      const settings = inject(SettingsService);
      const theme = inject(ThemeService);
      const schedule = inject(ScheduleService);
      const waterReminder = inject(WaterReminderService);
      const trayMenu = inject(TrayMenuService);
      const desktopPrefs = inject(DesktopPrefsService);
      const ui = inject(UiService);

      // The log is connected before anything else can fail, so the startup
      // sequence itself is on the record.
      await log.install();
      await db.init();
      await settings.loadSettings();
      theme.apply();
      await schedule.load();
      // One ticker for the water reminder: it reads the settings on every
      // tick, so turning the reminder on or off needs no restart.
      waterReminder.start();
      await trayMenu.init();
      // Reconciles "start with system" with the real OS state and applies
      // the saved always-on-top preference before the UI appears.
      await desktopPrefs.init();
      // Listens for the OS minimise button and, when this copy was started by
      // the OS at login, opens straight into the mini widget.
      await ui.init();
    }),
  ],
};
