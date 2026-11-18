import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';

/**
 * The metadata each application route contributes to the document.
 *
 * The router already carries a `title` per route. This adds the two pieces a
 * title alone does not cover: a description that matches the page rather than
 * the whole app, and a canonical URL that stays stable when a route carries a
 * date or a query string.
 */
export interface RouteSeoData {
  /** 140–160 characters. Shown in a search result under the title. */
  description?: string;
  /**
   * The path to advertise as canonical when it differs from the address bar.
   * `/journal/2026-11-17` is the same page as `/journal`, so the dated address
   * is not the one a crawler should record.
   */
  canonicalPath?: string;
}

/** Where the web build is published. Canonical URLs must be absolute. */
const SITE_ORIGIN = 'https://app.deepwork.rajatmalik.dev';

const APP_NAME = 'DeepWork';

const DEFAULT_TITLE = `${APP_NAME} — free focus timer, task manager and habit tracker`;

/**
 * Keeps `<title>`, the description, the social tags and the canonical link in
 * step with the route.
 *
 * Angular's default `TitleStrategy` only changes the title. That leaves every
 * screen sharing the app's one description and one canonical URL, which is the
 * wrong answer for a search result and for a shared link: `/tasks` is not the
 * same page as the dashboard.
 *
 * The strategy is deliberately browser-only. The application is a client-side
 * SPA with no SSR entry, so there is no server render for which a canonical URL
 * would be wrong; it simply runs when the router finishes a navigation. The
 * static marketing pages under `public/` carry their own metadata in the HTML,
 * because a crawler that does not run JavaScript has to see it there.
 */
@Injectable({ providedIn: 'root' })
export class SeoTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const routeTitle = this.buildTitle(snapshot);
    const pageTitle = routeTitle ? `${routeTitle} · ${APP_NAME}` : DEFAULT_TITLE;
    const data = this.collectSeoData(snapshot.root);

    this.title.setTitle(pageTitle);

    if (data.description) {
      this.setNameTag('description', data.description);
      this.setPropertyTag('og:description', data.description);
      this.setNameTag('twitter:description', data.description);
    }

    this.setPropertyTag('og:title', pageTitle);
    this.setNameTag('twitter:title', pageTitle);

    const path = data.canonicalPath ?? this.pathOf(snapshot.url);
    const canonical = `${SITE_ORIGIN}${path}`;
    this.setPropertyTag('og:url', canonical);
    this.setCanonical(canonical);
  }

  /**
   * Merges `data` from the root down, so a child route overrides its parent
   * without every child having to repeat the whole object.
   */
  private collectSeoData(root: ActivatedRouteSnapshot): RouteSeoData {
    const merged: RouteSeoData = {};
    let route: ActivatedRouteSnapshot | null = root;

    while (route) {
      const data = route.data as RouteSeoData;
      if (data.description) merged.description = data.description;
      if (data.canonicalPath) merged.canonicalPath = data.canonicalPath;
      route = route.firstChild;
    }

    return merged;
  }

  /** `/` for the root, otherwise the path without a query, hash or trailing slash. */
  private pathOf(url: string): string {
    const path = url.split(/[?#]/, 1)[0] ?? '/';
    if (!path || path === '/') return '/';
    return path.endsWith('/') ? path.slice(0, -1) : path;
  }

  private setNameTag(name: string, content: string): void {
    this.meta.updateTag({ name, content });
  }

  private setPropertyTag(property: string, content: string): void {
    this.meta.updateTag({ property, content });
  }

  private setCanonical(href: string): void {
    let link = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');

    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'canonical';
      this.document.head.appendChild(link);
    }

    link.href = href;
  }
}
