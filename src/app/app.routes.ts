import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'dashboard',
    redirectTo: '',
    pathMatch: 'full',
  },
  {
    path: 'tasks',
    loadComponent: () => import('./pages/tasks/tasks.component').then(m => m.TasksComponent),
  },
  {
    path: 'matrix',
    loadComponent: () => import('./pages/matrix/matrix.component').then(m => m.MatrixComponent),
  },
  {
    path: 'today',
    loadComponent: () => import('./pages/today/today.component').then(m => m.TodayComponent),
  },
  {
    path: 'analytics',
    loadComponent: () => import('./pages/analytics/analytics.component').then(m => m.AnalyticsComponent),
  },
  {
    path: 'habits',
    loadComponent: () => import('./pages/habits/habits.component').then(m => m.HabitsComponent),
  },
  {
    path: 'journal',
    loadComponent: () => import('./pages/journal/journal.component').then(m => m.JournalComponent),
  },
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings/settings.component').then(m => m.SettingsComponent),
  },
];
