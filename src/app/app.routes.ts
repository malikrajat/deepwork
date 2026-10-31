import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'dashboard',
    redirectTo: '',
    pathMatch: 'full',
  },
  {
    path: 'tasks',
    loadComponent: () => import('./pages/tasks/tasks.component').then((m) => m.TasksComponent),
  },
  {
    path: 'matrix',
    loadComponent: () => import('./pages/matrix/matrix.component').then((m) => m.MatrixComponent),
  },
  {
    path: 'calendar',
    loadComponent: () =>
      import('./pages/calendar/calendar.component').then((m) => m.CalendarComponent),
  },
  {
    path: 'today',
    loadComponent: () => import('./pages/today/today.component').then((m) => m.TodayComponent),
  },
  {
    path: 'analytics',
    loadComponent: () =>
      import('./pages/analytics/analytics.component').then((m) => m.AnalyticsComponent),
  },
  {
    path: 'time',
    loadComponent: () => import('./pages/time/time.component').then((m) => m.TimeComponent),
  },
  {
    path: 'reminders',
    loadComponent: () =>
      import('./pages/reminders/reminders.component').then((m) => m.RemindersComponent),
  },
  {
    path: 'habits',
    loadComponent: () => import('./pages/habits/habits.component').then((m) => m.HabitsComponent),
  },
  {
    path: 'journal',
    loadComponent: () =>
      import('./pages/journal/journal.component').then((m) => m.JournalComponent),
  },
  {
    path: 'journal/:date',
    loadComponent: () =>
      import('./pages/journal/journal.component').then((m) => m.JournalComponent),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./pages/settings/settings.component').then((m) => m.SettingsComponent),
  },
  {
    path: 'about',
    loadComponent: () => import('./pages/about/about.component').then((m) => m.AboutComponent),
  },
  {
    path: 'contact',
    loadComponent: () =>
      import('./pages/contact/contact.component').then((m) => m.ContactComponent),
  },
  {
    path: 'privacy',
    loadComponent: () => import('./pages/legal/legal.component').then((m) => m.LegalComponent),
    data: { document: 'privacy' },
  },
  {
    path: 'terms',
    loadComponent: () => import('./pages/legal/legal.component').then((m) => m.LegalComponent),
    data: { document: 'terms' },
  },
  {
    path: '**',
    redirectTo: '',
  },
];
