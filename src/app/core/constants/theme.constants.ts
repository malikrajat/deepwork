import { TaskStatus, TaskQuadrant } from '../models/task.model';
import { TimerType } from '../models/session.model';

// ─── Status ─────────────────────────────────────────────────────────────────
export interface StatusConfig {
  label: string;
  tooltip: string;
  color: string;
  bgColor: string;
}

export const STATUS_CONFIG: Record<TaskStatus, StatusConfig> = {
  'todo': {
    label: 'To Do',
    tooltip: 'Status: To Do — Click to start',
    color: '#9ca3af',
    bgColor: 'rgba(107,114,128,0.12)',
  },
  'in-progress': {
    label: 'In Progress',
    tooltip: 'Status: In Progress — Click to complete',
    color: '#f59e0b',
    bgColor: 'rgba(245,158,11,0.12)',
  },
  'done': {
    label: 'Done',
    tooltip: 'Status: Done — Click to reset',
    color: '#a78bfa',
    bgColor: 'rgba(139,92,246,0.12)',
  },
};

// Cycle order used by toggleStatus
export const STATUS_CYCLE: TaskStatus[] = ['todo', 'in-progress', 'done'];

// ─── Priority ───────────────────────────────────────────────────────────────
export interface PriorityConfig {
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
}

/**
 * Priority colors are intentionally aligned with quadrant colors:
 *   P1 Critical  →  Q1 Do First (red)
 *   P2 High      →  Q3 Urgent   (amber)
 *   P3 Medium    →  Q2 Schedule  (purple/accent)
 *   P4 Low       →  Q4 Eliminate (gray)
 */
export const PRIORITY_CONFIG: Record<1 | 2 | 3 | 4, PriorityConfig> = {
  1: {
    label: 'P1 — Critical',
    shortLabel: 'P1',
    color: '#f87171',
    bgColor: 'rgba(248,113,113,0.15)',
  },
  2: {
    label: 'P2 — High',
    shortLabel: 'P2',
    color: '#fbbf24',
    bgColor: 'rgba(251,191,36,0.15)',
  },
  3: {
    label: 'P3 — Medium',
    shortLabel: 'P3',
    color: '#a78bfa',
    bgColor: 'rgba(139,92,246,0.15)',
  },
  4: {
    label: 'P4 — Low',
    shortLabel: 'P4',
    color: '#9ca3af',
    bgColor: 'rgba(107,114,128,0.12)',
  },
};

// ─── Quadrant ───────────────────────────────────────────────────────────────
export interface QuadrantConfig {
  label: string;
  fullLabel: string;
  description: string;
  emoji: string;
  color: string;
  bgColor: string;
  borderColor: string;
  dotClass: string;
  sortOrder: number;
}

/**
 * Quadrant colors align with priority colors:
 *   Q1 urgent-important → P1 (red)
 *   Q2 important        → P3 (purple — deep work zone)
 *   Q3 urgent           → P2 (amber)
 *   Q4 neither          → P4 (gray)
 */
export const QUADRANT_CONFIG: Record<TaskQuadrant, QuadrantConfig> = {
  'urgent-important': {
    label: 'Do First',
    fullLabel: 'Q1 · Do First',
    description: 'Urgent & Important',
    emoji: '🔴',
    color: '#f87171',
    bgColor: 'rgba(248,113,113,0.12)',
    borderColor: 'rgba(248,113,113,0.25)',
    dotClass: 'danger',
    sortOrder: 1,
  },
  'important': {
    label: 'Schedule',
    fullLabel: 'Q2 · Schedule',
    description: 'Important, Not Urgent',
    emoji: '🟣',
    color: '#a78bfa',
    bgColor: 'rgba(139,92,246,0.12)',
    borderColor: 'rgba(139,92,246,0.25)',
    dotClass: 'accent',
    sortOrder: 2,
  },
  'urgent': {
    label: 'Delegate',
    fullLabel: 'Q3 · Delegate',
    description: 'Urgent, Not Important',
    emoji: '🟡',
    color: '#fbbf24',
    bgColor: 'rgba(251,191,36,0.12)',
    borderColor: 'rgba(251,191,36,0.25)',
    dotClass: 'warning',
    sortOrder: 3,
  },
  'neither': {
    label: 'Eliminate',
    fullLabel: 'Q4 · Eliminate',
    description: 'Neither',
    emoji: '⚪',
    color: '#9ca3af',
    bgColor: 'rgba(107,114,128,0.12)',
    borderColor: 'rgba(107,114,128,0.25)',
    dotClass: 'muted',
    sortOrder: 4,
  },
};

// ─── Timer ──────────────────────────────────────────────────────────────────
export interface TimerTypeConfig {
  label: string;
  color: string;
  gradient: string;
}

export const TIMER_TYPE_CONFIG: Record<TimerType, TimerTypeConfig> = {
  'work': {
    label: 'Focus Session',
    color: '#8b5cf6',
    gradient: 'url(#grad-work)',
  },
  'short-break': {
    label: 'Short Break',
    color: '#06b6d4',
    gradient: 'url(#grad-break)',
  },
  'long-break': {
    label: 'Long Break',
    color: '#34d399',
    gradient: '#34d399',
  },
};
