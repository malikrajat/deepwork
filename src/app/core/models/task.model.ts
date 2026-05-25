export type TaskStatus = 'todo' | 'in-progress' | 'done';
export type TaskQuadrant = 'urgent-important' | 'important' | 'urgent' | 'neither';

export interface RecurrenceConfig {
  frequency: 'daily' | 'weekly' | 'monthly';
  interval: number;
  days?: number[]; // 0=Sun, 1=Mon, ...
  endDate?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: 1 | 2 | 3 | 4;
  status: TaskStatus;
  quadrant: TaskQuadrant | null;
  deadline: string | null;
  tags: string[];
  recurrence: RecurrenceConfig | null;
  todayOrder: number | null;
  createdAt: string;
  completedAt: string | null;
}
