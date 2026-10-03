import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { reportBootstrapFailure } from './app/core/services/log.service';

bootstrapApplication(App, appConfig)
  // A failure this early has no UI and no database to fall back on, so it is
  // written to `crash.log` while the app is still coming up.
  .catch(async (err) => await reportBootstrapFailure(err));
