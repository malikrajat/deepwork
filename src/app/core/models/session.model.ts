export type TimerType = 'work' | 'short-break' | 'long-break';

export interface PomodoroSession {
  id: string;
  taskId: string | null;
  type: TimerType;
  durationPlanned: number;
  durationActual: number;
  startedAt: string;
  completedAt: string | null;
  interrupted: boolean;
}

export interface TimerState {
  isRunning: boolean;
  type: TimerType;
  remainingSeconds: number;
  taskId: string | null;
  sessionCount: number;
  startedAt: string | null;
}
