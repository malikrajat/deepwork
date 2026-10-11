import {
  Component,
  signal,
  inject,
  computed,
  ChangeDetectionStrategy,
  DestroyRef,
  OnInit,
} from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { SidebarComponent } from './shared/components/sidebar/sidebar.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { InstallBannerComponent } from './shared/components/install-banner/install-banner.component';
import { WelcomePrefsDialogComponent } from './shared/components/welcome-prefs-dialog/welcome-prefs-dialog.component';
import { MiniWidgetComponent } from './shared/components/mini-widget/mini-widget.component';
import { QuickAddComponent } from './shared/components/quick-add/quick-add.component';
import { UpdatePromptComponent } from './shared/components/update-prompt/update-prompt.component';
import { WaterNudgeComponent } from './shared/components/water-nudge/water-nudge.component';
import { VisitorStatsDialogComponent } from './shared/components/visitor-stats-dialog/visitor-stats-dialog.component';
import { TimerService } from './core/services/timer.service';
import { UiService } from './core/services/ui.service';
import { InstallService } from './core/services/install.service';
import { SettingsService } from './core/services/settings.service';
import { DbService } from './core/services/db.service';
import { UpdatePromptService } from './core/services/update-prompt.service';
import { NotificationService } from './core/services/notification.service';
import { VisitorCounterService } from './core/services/visitor-counter.service';

const PAGE_ROUTES = [
  '',
  'today',
  'matrix',
  'calendar',
  'tasks',
  'analytics',
  'habits',
  'journal',
  'settings',
  'about',
];

/**
 * The width below which the sidebar stops being a column and becomes a drawer.
 *
 * It is written here as well as in `styles.css` and `app.css` because a custom
 * property cannot be read from a media query condition, and JavaScript has to
 * agree with the CSS about when the shell has changed shape: it decides whether
 * the sidebar may render collapsed, whether the drawer is allowed to be open,
 * and whether the navigation behind it is inert.
 *
 * 900px is where a 240px sidebar stops being a side panel and starts being a
 * quarter of the window. The desktop app can be dragged down to its 800x600
 * minimum and does enter this layout there, which is intended: at that size the
 * user needs the width more than they need a permanently visible menu.
 */
const COMPACT_LAYOUT_QUERY = '(max-width: 900px)';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    SidebarComponent,
    ToastComponent,
    InstallBannerComponent,
    WelcomePrefsDialogComponent,
    MiniWidgetComponent,
    QuickAddComponent,
    UpdatePromptComponent,
    WaterNudgeComponent,
    VisitorStatsDialogComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown)': 'handleKeyboard($event)',
  },
})
export class App implements OnInit {
  private readonly router = inject(Router);
  private readonly timer = inject(TimerService);
  private readonly settingsService = inject(SettingsService);
  private readonly db = inject(DbService);
  private readonly updatePrompt = inject(UpdatePromptService);
  private readonly notifications = inject(NotificationService);
  private readonly visitors = inject(VisitorCounterService);
  ui = inject(UiService);
  private readonly install = inject(InstallService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * True while the window is too narrow for the sidebar to sit beside the
   * content — see `COMPACT_LAYOUT_QUERY`.
   *
   * Kept as state rather than asked of the CSS alone because two decisions
   * cannot be expressed in a stylesheet: the sidebar's collapsed input has to be
   * ignored here (an icon rail inside a drawer is unusable), and the navigation
   * has to be taken out of the tab order and the accessibility tree while the
   * drawer is shut.
   */
  readonly isCompactLayout = signal(false);

  /** True while the mobile navigation drawer is open. */
  readonly mobileNavOpen = signal(false);

  /**
   * True while the navigation is present but not reachable.
   *
   * Below the breakpoint the drawer is a panel that has slid off the left edge
   * — technically still rendered, still focusable and still read out by a
   * screen reader. `inert` is what makes "off screen" mean "not there", and it
   * is only ever set in the compact layout: on the desktop the sidebar is the
   * primary navigation and must stay reachable.
   */
  readonly drawerIsInert = computed(() => this.isCompactLayout() && !this.mobileNavOpen());

  /**
   * True while the install banner is showing, so the shell can leave it room.
   *
   * The banner is not rendered at all while the window is the mini widget, so
   * neither is the gap.
   */
  readonly installBannerOpen = computed(
    () => !this.ui.isNativeWidget() && this.install.isVisible(),
  );

  sidebarCollapsed = signal(false);

  ngOnInit(): void {
    this.db.init().then(async () => {
      await this.settingsService.loadSettings();
    });
    this.watchLayoutWidth();
    this.closeDrawerOnNavigate();
    // Counted from here rather than from a page, because a visit is a visit
    // wherever it lands; the service decides whether this build should count
    // anything at all (the desktop app does not) and whether the user asked not
    // to be. Not awaited: nothing on screen depends on it.
    this.visitors.start();
    // Asked for once, at the app's own startup rather than on one page's: a
    // finished session has to be able to reach the desktop from wherever the
    // user happens to be, and that includes the pages that never asked.
    void this.notifications.init();
    // Asks GitHub whether a newer release exists, once per check interval, and
    // tells the user if there is something to install. Not awaited: a slow
    // network must never hold up the window.
    void this.updatePrompt.start();
  }

  toggleSidebar() {
    this.sidebarCollapsed.update((v) => !v);
  }

  /** The mobile top bar's menu button. */
  toggleMobileNav() {
    this.mobileNavOpen.update((v) => !v);
  }

  closeMobileNav() {
    this.mobileNavOpen.set(false);
  }

  /**
   * Follows the window across the breakpoint, in both directions.
   *
   * Growing past it closes the drawer rather than leaving it open: in the wide
   * layout the sidebar is a column beside the content, so an open drawer would
   * be a panel sitting over the page with a backdrop and nothing obviously
   * wrong — a state the user never asked for and could only leave by closing a
   * menu they can see is already open.
   */
  private watchLayoutWidth(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(COMPACT_LAYOUT_QUERY);
    const apply = (compact: boolean) => {
      this.isCompactLayout.set(compact);
      if (!compact) this.mobileNavOpen.set(false);
    };
    apply(query.matches);
    const onChange = (event: MediaQueryListEvent) => apply(event.matches);
    query.addEventListener('change', onChange);
    // The listener outlives nothing, but a subscription that is never removed
    // is the kind of thing that becomes a leak the day this component is not
    // the root any more.
    this.destroyRef.onDestroy(() => query.removeEventListener('change', onChange));
  }

  /**
   * Closes the drawer when the route changes underneath it.
   *
   * Tapping a nav link closes it directly (see the sidebar's `closeMobile`
   * output) because navigating to the page already open raises no navigation
   * event at all. This covers the other ways the page can change while the
   * drawer is up — the browser's own back and forward buttons, and any link
   * inside a page — so the drawer can never be left open over a page the user
   * did not choose from it.
   */
  private closeDrawerOnNavigate(): void {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.mobileNavOpen.set(false));
  }

  handleKeyboard(event: KeyboardEvent) {
    if (this.handleEscape(event)) return;
    if (this.handleFocusToggle(event)) return;
    if (this.handlePageNavigation(event)) return;
    this.handleSpaceTimer(event);
  }

  private handleEscape(event: KeyboardEvent): boolean {
    if (event.key !== 'Escape') return false;
    // The drawer is the topmost layer, so it is what Escape closes first —
    // otherwise dismissing it would also leave Focus Mode behind it.
    if (this.mobileNavOpen()) {
      event.preventDefault();
      this.mobileNavOpen.set(false);
      return true;
    }
    // The widget is reachable from every page — the system minimise button does
    // not care which route is open — so it has to answer to Esc from here.
    if (this.ui.isMiniMode()) {
      event.preventDefault();
      void this.ui.exitMiniMode();
      return true;
    }
    if (this.ui.focusMode()) {
      event.preventDefault();
      this.ui.exitFocusMode();
      return true;
    }
    return false;
  }

  private handleFocusToggle(event: KeyboardEvent): boolean {
    if (event.ctrlKey && event.shiftKey && event.key === 'F') {
      event.preventDefault();
      this.ui.toggleFocusMode();
      return true;
    }
    return false;
  }

  private handlePageNavigation(event: KeyboardEvent): boolean {
    if (event.ctrlKey && !event.shiftKey && !event.altKey) {
      const num = Number.parseInt(event.key);
      if (num >= 1 && num <= PAGE_ROUTES.length) {
        event.preventDefault();
        this.router.navigate(['/' + PAGE_ROUTES[num - 1]]);
        return true;
      }
    }
    return false;
  }

  private handleSpaceTimer(event: KeyboardEvent): void {
    if (event.code !== 'Space' || this.isInputFocused(event)) return;
    const url = this.router.url;
    if (url === '/' || url === '/dashboard' || url === '') {
      event.preventDefault();
      if (this.timer.isRunning()) {
        this.timer.pause();
      } else {
        this.timer.start();
      }
    }
  }

  private isInputFocused(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement;
    const tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || target.isContentEditable;
  }
}
