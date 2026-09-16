import { ApplicationConfig, provideBrowserGlobalErrorListeners, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { DbService } from './core/services/db.service';
import { SettingsService } from './core/services/settings.service';
import { ThemeService } from './core/services/theme.service';
import { TrayMenuService } from './core/services/tray-menu.service';
import { ScheduleService } from './core/services/schedule.service';
import { CalendarReminderService } from './core/services/calendar-reminder.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    {
      provide: APP_INITIALIZER,
      useFactory: (
        db: DbService,
        settings: SettingsService,
        theme: ThemeService,
        trayMenu: TrayMenuService,
        schedule: ScheduleService,
        reminders: CalendarReminderService
      ) =>
        async (): Promise<void> => {
          await db.init();
          await settings.loadSettings();
          theme.apply();
          await schedule.load();
          // "Starts in 5 minutes" / "ends in 5 minutes" nudges.
          void reminders.start();
          await trayMenu.init();
        },
      deps: [DbService, SettingsService, ThemeService, TrayMenuService, ScheduleService, CalendarReminderService],
      multi: true,
    },
  ],
};
