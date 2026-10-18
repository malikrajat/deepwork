export type TimerType = 'work' | 'short-break' | 'long-break';

export interface PomodoroSession {
  id: string;
  taskId: string | null;
  /**
   * The task's title when the session was recorded.
   *
   * A snapshot, because `taskId` is cleared when a task is deleted and the
   * Time page still needs to know which work the hours belonged to. Optional
   * on records written before the snapshot existed.
   */
  taskTitle?: string | null;
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
  lastActiveDate: string | null;
}
