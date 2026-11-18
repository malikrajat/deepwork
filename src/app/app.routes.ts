import { Routes } from '@angular/router';

/**
 * The public screens of the app.
 *
 * Each route carries a `title` and a `data.description`, which
 * `SeoTitleStrategy` turns into the document title, the description, the social
 * tags and the canonical link. `canonicalPath` is only set where two addresses
 * render the same screen (`/journal/2026-11-17` and `/journal`), so the dated
 * form does not become a separate indexed page.
 *
 * The written guides and the policy pages are not routes: they are static HTML
 * files under `public/`, served with a real 200 status, because GitHub Pages
 * answers an unknown path with the app shell under a 404 status.
 */
export const routes: Routes = [
  {
    path: '',
    title: 'Focus timer and today’s tasks',
    data: {
      description:
        'A free, local-first Pomodoro timer with today’s tasks, a day planner and habits. No account, no cloud, and your data stays on your machine.',
    },
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
    title: 'Task board',
    data: {
      description:
        'A To Do, In Progress and Done board with search, recurrence, Excel/CSV import and export. Every task stays in the app’s local database.',
    },
    loadComponent: () => import('./pages/tasks/tasks.component').then((m) => m.TasksComponent),
  },
  {
    path: 'matrix',
    title: 'Eisenhower matrix',
    data: {
      description:
        'Sort tasks into four quadrants — Do First, Schedule, Delegate and Eliminate — then plan the important ones into focus blocks.',
    },
    loadComponent: () => import('./pages/matrix/matrix.component').then((m) => m.MatrixComponent),
  },
  {
    path: 'calendar',
    title: 'Day planner',
    data: {
      description:
        'Lay tasks onto a day timeline as focus blocks, keep the breaks reserved, and let the plan follow your timer’s block length.',
    },
    loadComponent: () =>
      import('./pages/calendar/calendar.component').then((m) => m.CalendarComponent),
  },
  {
    path: 'today',
    title: 'Today',
    data: {
      description:
        'Everything due today, everything overdue and everything you starred, in one list, ready to start a focus session.',
    },
    loadComponent: () => import('./pages/today/today.component').then((m) => m.TodayComponent),
  },
  {
    path: 'analytics',
    title: 'Analytics',
    data: {
      description:
        'Focus, task, habit and journal figures with trends and plain-language readings, computed on your own machine from your own records.',
    },
    loadComponent: () =>
      import('./pages/analytics/analytics.component').then((m) => m.AnalyticsComponent),
  },
  {
    path: 'time',
    title: 'Time by Task',
    data: {
      description:
        'Every focus session grouped by the work it paid for, with all-time totals, first and last session and a repeat rhythm.',
    },
    loadComponent: () => import('./pages/time/time.component').then((m) => m.TimeComponent),
  },
  {
    path: 'reminders',
    title: 'Standing reminders',
    data: {
      description:
        'Reminders that survive a restart and keep asking until you answer them. Done, Snooze or Stop, with matching desktop notifications.',
    },
    loadComponent: () =>
      import('./pages/reminders/reminders.component').then((m) => m.RemindersComponent),
  },
  {
    path: 'habits',
    title: 'Habits and streaks',
    data: {
      description:
        'Daily habits with check-in strips, current streaks and personal bests, stored beside your focus sessions and journal.',
    },
    loadComponent: () => import('./pages/habits/habits.component').then((m) => m.HabitsComponent),
  },
  {
    path: 'journal',
    title: 'Journal',
    data: {
      description:
        'Dated journal entries with word counts and a writing-versus-focus view, kept in the same local database as your tasks.',
      canonicalPath: '/journal',
    },
    loadComponent: () =>
      import('./pages/journal/journal.component').then((m) => m.JournalComponent),
  },
  {
    path: 'journal/:date',
    title: 'Journal',
    data: {
      description:
        'Dated journal entries with word counts and a writing-versus-focus view, kept in the same local database as your tasks.',
      canonicalPath: '/journal',
    },
    loadComponent: () =>
      import('./pages/journal/journal.component').then((m) => m.JournalComponent),
  },
  {
    path: 'settings',
    title: 'Settings',
    data: {
      description:
        'Timer lengths, notifications, desktop behaviour, backup and diagnostics. Every setting is stored locally on your machine.',
    },
    loadComponent: () =>
      import('./pages/settings/settings.component').then((m) => m.SettingsComponent),
  },
  {
    path: 'about',
    title: 'About',
    data: {
      description:
        'Who builds DeepWork, what version you are running, the latest desktop downloads and the update check.',
    },
    loadComponent: () => import('./pages/about/about.component').then((m) => m.AboutComponent),
  },
  {
    path: 'contact',
    title: 'Contact',
    data: {
      description:
        'Send a message to the developer, report a bug or ask a question about DeepWork. Usually answered within one business day.',
    },
    loadComponent: () =>
      import('./pages/contact/contact.component').then((m) => m.ContactComponent),
  },
  {
    path: 'privacy',
    title: 'Privacy policy',
    data: {
      description:
        'What DeepWork stores on your device, what the website collects, the cookies used by analytics and AdSense, and your choices.',
      document: 'privacy',
    },
    loadComponent: () => import('./pages/legal/legal.component').then((m) => m.LegalComponent),
  },
  {
    path: 'terms',
    title: 'Terms and conditions',
    data: {
      description:
        'The MIT licence, advertising and third-party links, your data and backups, and the limits of the promise.',
      document: 'terms',
    },
    loadComponent: () => import('./pages/legal/legal.component').then((m) => m.LegalComponent),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
