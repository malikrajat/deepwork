import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { IconComponent, IconName } from '../icon/icon.component';
import { CommandPaletteService } from '../../../core/services/command-palette.service';
import { TaskService } from '../../../core/services/task.service';
import { TimerService } from '../../../core/services/timer.service';
import { UiService } from '../../../core/services/ui.service';
import { QuietService } from '../../../core/services/quiet.service';
import { TaskEditorService } from '../../../core/services/task-editor.service';
import { FocusLauncherService } from '../../../core/services/focus-launcher.service';

interface PaletteCommand {
  id: string;
  label: string;
  hint: string;
  group: 'Do' | 'Go to' | 'Tasks';
  icon: IconName;
  shortcut?: string;
  keywords: string;
  run: () => void | Promise<void>;
}

const PAGES: ReadonlyArray<{ path: string; label: string; hint: string; icon: IconName }> = [
  { path: '', label: 'Dashboard', hint: 'Timer, today’s goal and live sessions', icon: 'target' },
  { path: 'today', label: 'Today', hint: 'The day’s board, one list', icon: 'sun' },
  {
    path: 'matrix',
    label: 'Eisenhower Matrix',
    hint: 'Sort work by urgency and importance',
    icon: 'tasks',
  },
  { path: 'calendar', label: 'Calendar', hint: 'The day mapped onto focus blocks', icon: 'clock' },
  { path: 'tasks', label: 'Tasks', hint: 'All tasks, grouped by date', icon: 'tasks' },
  { path: 'analytics', label: 'Analytics', hint: 'What the numbers say', icon: 'chart' },
  { path: 'time', label: 'Time by Task', hint: 'Where your focus went', icon: 'clock' },
  {
    path: 'reminders',
    label: 'Reminders',
    hint: 'Promises that stand until answered',
    icon: 'sparkles',
  },
  { path: 'habits', label: 'Habits', hint: 'Streaks, consistency and check-ins', icon: 'flame' },
  { path: 'journal', label: 'Journal', hint: 'Reflect on the day', icon: 'edit' },
  {
    path: 'settings',
    label: 'Settings',
    hint: 'Timer, notifications, wellbeing',
    icon: 'settings',
  },
  { path: 'about', label: 'About', hint: 'The developer, the app and updates', icon: 'help' },
];

/**
 * Quick jump, on every page.
 *
 * Ctrl/Cmd+K (or the sidebar's row) opens one searchable list of the app's
 * destinations and its most useful actions, including today's open tasks. It is
 * the same idea as the dashboard palette, lifted out of that page so a user who
 * is deep in Habits does not have to remember which number opens Settings.
 */
@Component({
  selector: 'app-command-palette',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (palette.open()) {
      <div class="palette-backdrop" (click)="close()" (keydown.escape)="close()" tabindex="-1">
        <div
          class="palette"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-jump-title"
          (click)="$event.stopPropagation()"
          (keydown)="onKeydown($event)"
        >
          <h2 id="quick-jump-title" class="visually-hidden">Jump to anything</h2>

          <div class="palette-search">
            <app-icon name="search" [size]="18" />
            <input
              #searchInput
              type="text"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls="quick-jump-list"
              [attr.aria-activedescendant]="activeId()"
              [value]="query()"
              (input)="onInput($event)"
              placeholder="Jump to a page, an action or a task…"
              aria-label="Search pages, actions and tasks"
            />
            <button class="palette-close" type="button" (click)="close()" aria-label="Close">
              <kbd>Esc</kbd>
            </button>
          </div>

          <ul id="quick-jump-list" class="palette-list" role="listbox" aria-label="Results">
            @for (group of groups(); track group.name) {
              <li class="palette-group" role="presentation">{{ group.name }}</li>
              @for (entry of group.items; track entry.command.id) {
                <li
                  [id]="'quick-jump-' + entry.command.id"
                  class="palette-item"
                  role="option"
                  [attr.aria-selected]="entry.index === index()"
                  [class.is-active]="entry.index === index()"
                  (click)="run(entry.command)"
                  (mouseenter)="index.set(entry.index)"
                >
                  <span class="palette-glyph" aria-hidden="true">
                    <app-icon [name]="entry.command.icon" [size]="16" />
                  </span>
                  <span class="palette-copy">
                    <span class="palette-label">{{ entry.command.label }}</span>
                    <span class="palette-hint">{{ entry.command.hint }}</span>
                  </span>
                  @if (entry.command.shortcut) {
                    <kbd>{{ entry.command.shortcut }}</kbd>
                  } @else {
                    <app-icon name="arrow-right" [size]="14" />
                  }
                </li>
              }
            } @empty {
              <li class="palette-empty">
                Nothing matches “{{ query() }}”. Try “task” or “settings”.
              </li>
            }
          </ul>

          <p class="palette-foot">
            <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
            <span><kbd>Enter</kbd> open</span>
            <span><kbd>Esc</kbd> close</span>
          </p>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .palette-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1200;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        padding: max(8vh, 48px) var(--space-md) var(--space-md);
        background: rgba(4, 2, 12, 0.62);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        animation: palette-in 0.16s ease-out both;
      }
      @keyframes palette-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      .palette {
        width: min(640px, 100%);
        max-height: min(78vh, 700px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid var(--glass-border-accent);
        border-radius: var(--radius-xl);
        background:
          linear-gradient(160deg, rgba(139, 92, 246, 0.06), transparent 46%),
          var(--color-bg-secondary);
        box-shadow:
          0 32px 90px rgba(0, 0, 0, 0.55),
          0 0 0 1px rgba(255, 255, 255, 0.03) inset;
      }
      .palette-search {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 16px;
        border-bottom: 1px solid var(--glass-border);
        color: var(--color-accent-secondary);
      }
      .palette-search input {
        flex: 1;
        min-width: 0;
        border: 0;
        outline: none;
        background: transparent;
        color: var(--color-text-primary);
        font: 600 var(--text-lg) var(--font-sans);
        letter-spacing: -0.01em;
      }
      .palette-search input::placeholder {
        color: var(--color-text-muted);
        font-weight: 450;
      }
      .palette-close {
        border: 0;
        background: transparent;
        padding: 0;
        cursor: pointer;
      }
      .palette-close:hover kbd {
        color: var(--color-text-primary);
        border-color: var(--glass-border-accent);
      }
      .palette-list {
        list-style: none;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 8px;
        margin: 0;
      }
      .palette-group {
        padding: 10px 10px 6px;
        color: var(--color-text-muted);
        font-size: var(--text-2xs);
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .palette-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: var(--radius-lg);
        cursor: pointer;
        border: 1px solid transparent;
        color: var(--color-text-secondary);
      }
      .palette-item.is-active {
        border-color: var(--glass-border-accent);
        background: var(--glass-bg-active);
        color: var(--color-text-primary);
      }
      .palette-glyph {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        flex-shrink: 0;
        border-radius: var(--radius-md);
        border: 1px solid var(--glass-border);
        background: var(--glass-bg);
        color: var(--color-accent-secondary);
      }
      .palette-item.is-active .palette-glyph {
        border-color: var(--glass-border-accent);
        color: var(--color-accent-primary);
      }
      .palette-copy {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
      }
      .palette-label {
        font-size: var(--text-base);
        font-weight: 650;
        color: inherit;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .palette-hint {
        font-size: var(--text-2xs);
        color: var(--color-text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .palette-item app-icon {
        color: var(--color-text-muted);
      }
      .palette-empty {
        padding: 28px 16px;
        text-align: center;
        color: var(--color-text-muted);
        font-size: var(--text-sm);
      }
      .palette-foot {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        gap: 16px;
        padding: 10px 14px;
        border-top: 1px solid var(--glass-border);
        color: var(--color-text-muted);
        font-size: var(--text-2xs);
      }
      .palette-foot span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      kbd {
        display: inline-block;
        padding: 2px 6px;
        border: 1px solid var(--glass-border);
        border-bottom-width: 2px;
        border-radius: var(--radius-xs);
        background: var(--glass-bg);
        color: var(--color-text-secondary);
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        line-height: 1.4;
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      @media (max-width: 640px) {
        .palette-backdrop {
          padding: 12px var(--space-sm);
          align-items: flex-start;
        }
        .palette {
          max-height: calc(100dvh - 24px);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .palette-backdrop {
          animation: none;
        }
      }
    `,
  ],
})
export class CommandPaletteComponent {
  readonly palette = inject(CommandPaletteService);
  private readonly router = inject(Router);
  private readonly tasks = inject(TaskService);
  private readonly taskEditor = inject(TaskEditorService);
  private readonly focusLauncher = inject(FocusLauncherService);
  private readonly timer = inject(TimerService);
  private readonly ui = inject(UiService);
  private readonly quiet = inject(QuietService);

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly query = signal('');
  readonly index = signal(0);

  /** All commands, in the order the empty search shows them. */
  private readonly commands = computed<PaletteCommand[]>(() => {
    const pages = PAGES.map<PaletteCommand>((page) => ({
      id: `page-${page.path || 'dashboard'}`,
      label: `Open ${page.label}`,
      hint: page.hint,
      group: 'Go to',
      icon: page.icon,
      keywords: `${page.label} ${page.path} navigate go`,
      run: () => {
        void this.router.navigate(['/' + page.path]);
      },
    }));

    const actions: PaletteCommand[] = [
      {
        id: 'action-add-task',
        label: 'Add a task for today',
        hint: 'Type it, or say it in English',
        group: 'Do',
        icon: 'plus',
        shortcut: 'Ctrl N',
        keywords: 'new task create quick add today',
        run: () => this.ui.requestQuickAdd(),
      },
      {
        id: 'action-timer',
        label: this.timer.isRunning() ? 'Pause the focus timer' : 'Start a focus session',
        hint: this.timer.isRunning()
          ? 'Hold the clock where it is'
          : 'Begin a block on the dashboard',
        group: 'Do',
        icon: this.timer.isRunning() ? 'pause' : 'play',
        shortcut: 'Space',
        keywords: 'timer focus start pause clock pomodoro',
        run: () => {
          if (this.timer.isRunning()) {
            this.timer.pause();
            return;
          }
          void this.router.navigate(['/']).then(() => this.timer.start());
        },
      },
      {
        id: 'action-focus-mode',
        label: this.ui.focusMode() ? 'Leave focus mode' : 'Enter focus mode',
        hint: 'Hide the furniture, keep the work',
        group: 'Do',
        icon: 'fullscreen',
        shortcut: 'Ctrl ⇧ F',
        keywords: 'focus mode distraction hide',
        run: () => this.ui.toggleFocusMode(),
      },
      {
        id: 'action-quiet',
        label: 'Pause, mute or focus',
        hint: 'One panel for quiet controls',
        group: 'Do',
        icon: 'moon',
        shortcut: 'Ctrl ⇧ Q',
        keywords: 'quiet pause mute notifications',
        run: () => this.quiet.togglePanel(),
      },
    ];

    const openTasks = this.tasks
      .tasks()
      .filter((task) => task.status !== 'done')
      .slice(0, 8)
      .map<PaletteCommand>((task) => {
        const startable = this.focusLauncher.canStart(task);
        return {
          id: `task-${task.id}`,
          label: task.title,
          hint: startable ? 'Start a focus session on this task' : 'Open this task in the editor',
          group: 'Tasks',
          icon: startable ? 'play' : 'edit',
          keywords: `task ${task.title} ${task.description}`,
          run: () => {
            if (startable) void this.focusLauncher.start(task);
            else this.taskEditor.openEdit(task);
          },
        };
      });

    return [...actions, ...pages, ...openTasks];
  });

  /** The commands the query keeps, in group order. */
  readonly filtered = computed(() => {
    const query = this.query().trim().toLowerCase();
    if (!query) return this.commands();
    const terms = query.split(/\s+/);
    return this.commands().filter((command) => {
      const haystack = `${command.label} ${command.hint} ${command.keywords}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  });

  /** The same list, numbered and grouped for the template. */
  readonly groups = computed(() => {
    const order: PaletteCommand['group'][] = ['Do', 'Tasks', 'Go to'];
    let flatIndex = 0;
    return order
      .map((name) => {
        const items = this.filtered()
          .filter((command) => command.group === name)
          .map((command) => ({ command, index: flatIndex++ }));
        return { name, items };
      })
      .filter((group) => group.items.length > 0);
  });

  /** The id of the row the keyboard is on, for `aria-activedescendant`. */
  readonly activeId = computed(() => {
    const command = this.filtered()[this.index()];
    return command ? `quick-jump-${command.id}` : null;
  });

  constructor() {
    effect(() => {
      if (!this.palette.open()) return;
      this.query.set('');
      this.index.set(0);
      queueMicrotask(() => this.searchInput()?.nativeElement.focus());
    });
  }

  onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.index.set(0);
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.filtered().length;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (count > 0) this.index.update((value) => (value + 1) % count);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (count > 0) this.index.update((value) => (value - 1 + count) % count);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const command = this.filtered()[this.index()];
      if (command) this.run(command);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  run(command: PaletteCommand): void {
    this.close();
    void command.run();
  }

  close(): void {
    this.palette.hide();
  }
}
