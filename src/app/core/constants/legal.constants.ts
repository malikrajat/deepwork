/**
 * The text of the two policy pages, in one place.
 *
 * Both documents describe what this build actually does: data stays on the
 * machine, the analysis runs offline, and the only network calls are the update
 * check and the links the user chooses to open. Keeping the wording here means
 * the pages can be updated without touching their layout, and the shared
 * sentences cannot drift apart.
 */

export type LegalDocumentId = 'privacy' | 'terms';

/** One headed block of a policy page. */
export interface LegalSection {
  readonly heading: string;
  readonly paragraphs?: readonly string[];
  readonly bullets?: readonly string[];
}

export interface LegalDocument {
  readonly id: LegalDocumentId;
  readonly title: string;
  readonly subtitle: string;
  /** Shown at the top and in the page's metadata line. */
  readonly updated: string;
  readonly sections: readonly LegalSection[];
}

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  privacy: {
    id: 'privacy',
    title: 'Privacy policy',
    subtitle: 'Nothing is collected about you. Everything you create stays on your device.',
    updated: '28 October 2026',
    sections: [
      {
        heading: 'The short version',
        paragraphs: [
          'DeepWork collects no data. There is no account, no sign-up, no telemetry, no analytics, no tracking, no advertising and no payment. Nothing about you, your device or the way you use the app is collected, sold, shared or sent to the developer.',
          'DeepWork is local-first: everything you create — tasks, sessions, habits, journal entries and settings — is stored only on the device you run it on. Whatever you do in the app is entirely yours.',
        ],
      },
      {
        heading: 'What the app stores',
        paragraphs: ['DeepWork keeps the following in a local database on your device:'],
        bullets: [
          'Tasks, including deadlines, priorities and recurrence rules.',
          'Focus sessions, timer history and time-by-task records.',
          'Habits and their completion history.',
          'Journal entries and any formatting they contain.',
          'Preferences such as timer lengths, theme, reminder schedules and notification settings.',
          'Statistics for the optional visitor counter.',
          'A local record of when the app last checked for updates.',
        ],
      },
      {
        heading: 'Where the data lives',
        paragraphs: [
          'On the desktop app the database is a file on your machine, inside the application-data directory of your operating system. In the browser build it is kept in that browser’s local storage for the address you opened it from.',
          'You can export or delete records from inside the app. Removing the app, clearing the browser’s site data or deleting the database file removes those records with it. DeepWork does not keep a copy anywhere else.',
        ],
      },
      {
        heading: 'What leaves your device',
        paragraphs: [
          'There is no DeepWork account and no DeepWork backend. Your tasks, sessions, habits and journal are never uploaded.',
          'Two kinds of network request happen, and only when needed:',
        ],
        bullets: [
          'Update checks: the app asks GitHub’s public release API whether a newer version exists. The request carries no personal data from DeepWork; like any web request, GitHub can see the IP address it came from and when it was made. GitHub handles that information under its own privacy statement.',
          'Downloads and links: installers and release notes open on GitHub, and the browser build is served by GitHub Pages. Following a link to another site — LinkedIn, GitHub, Medium or this developer’s portfolio — takes you to a service with its own privacy policy.',
        ],
      },
      {
        heading: 'Notifications and reminders',
        paragraphs: [
          'Focus, water, movement and standing reminders are scheduled locally by the app and delivered through your operating system’s notification system. No push server is involved and no reminder content is sent anywhere.',
        ],
      },
      {
        heading: 'The analysis on the Analytics page',
        paragraphs: [
          'The figures and plain-language readings on the Analytics page are calculated on your machine from your own records. There is no account, API key or remote model involved, and the analysis is not uploaded, pooled with other people or used to train anything.',
        ],
      },
      {
        heading: 'If you contact the developer',
        paragraphs: [
          'If you send an email, the address you write from and anything you include are used only to read and answer your message. They are not added to a mailing list, sold or shared, except where the law requires it. You can ask for the correspondence to be deleted at any time.',
        ],
      },
      {
        heading: 'Children',
        paragraphs: [
          'DeepWork is a productivity tool for general use and is not directed at children under 13. The app does not knowingly collect personal information from anyone, including children.',
        ],
      },
      {
        heading: 'Changes to this policy',
        paragraphs: [
          'If the way DeepWork handles data changes, this page will be updated and the date at the top changed. Because the app stores its data locally, a change to this policy cannot reach back into records you hold on your own machine.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: ['Questions about this policy can go to contact@therate.dev.'],
      },
    ],
  },
  terms: {
    id: 'terms',
    title: 'Terms & conditions',
    subtitle: 'Free software, provided as-is, used entirely at your own risk.',
    updated: '28 October 2026',
    sections: [
      {
        heading: 'Acceptance',
        paragraphs: [
          'By installing, opening or using DeepWork, you agree to these terms. If you do not agree, do not use the app.',
          'If you use DeepWork, you do so entirely at your own risk. Whatever you do with the app, and whatever results from it, is your own responsibility.',
        ],
      },
      {
        heading: 'No charge and no data collection',
        paragraphs: [
          'DeepWork is free. There is no subscription, purchase price, in-app payment or fee of any kind, and the developer does not charge you or take money from you.',
          'The app does not collect data about you. There is no account, no telemetry, no analytics and no tracking. Nothing is taken from you, and whatever you do in DeepWork stays on your device.',
        ],
      },
      {
        heading: 'What DeepWork is',
        paragraphs: [
          'DeepWork is a focus timer, task manager and personal record-keeping app. It is a productivity tool, not a medical, legal, financial or safety device.',
          'Reminders, timers and notifications depend on your device, its power state, its operating system and the permissions you grant. They may be delayed or may not appear at all. Do not rely on DeepWork for anything where a missed alert could cause harm.',
        ],
      },
      {
        heading: 'Licence',
        paragraphs: [
          'DeepWork is open-source software released under the MIT licence. The licence in the project repository governs how you may use, copy, modify and distribute the source code.',
          'This page does not replace that licence. Where these terms and the licence disagree about the code, the licence wins.',
        ],
      },
      {
        heading: 'Your data and backups',
        paragraphs: [
          'Your records belong to you and stay on your device. You are responsible for keeping backups of anything you cannot afford to lose.',
          'Uninstalling the app, clearing browser data, deleting the database file or resetting the application data can permanently remove your records. DeepWork cannot restore them because it never had a copy.',
          'Whatever you do with the app, and whatever happens to your device, your records or your work, is your own responsibility. The developer has no access to your data and cannot recover, correct or remove it for you.',
        ],
      },
      {
        heading: 'Acceptable use',
        paragraphs: [
          'Use DeepWork lawfully. Do not use it to break the law, to interfere with another person’s device or data, or to misrepresent the app as your own product where the licence does not allow it.',
        ],
      },
      {
        heading: 'Updates, improvements and third-party services',
        paragraphs: [
          'The app may check for and offer updates from GitHub. Updates, downloads, hosting and links to other websites are provided by third parties and are subject to their own terms and availability.',
          'Any update, improvement, new feature or change is provided on the same basis as the app itself: as-is, with no guarantee that it will arrive, work as expected, or continue to be available. The developer is under no obligation to provide updates, support or fixes.',
          'An update can change or remove features. Nothing in these terms guarantees that a particular version or feature will remain available.',
        ],
      },
      {
        heading: 'No warranty',
        paragraphs: [
          'DeepWork is provided “as is” and “as available”, without warranties of any kind, whether express or implied, including fitness for a particular purpose, merchantability, accuracy or non-infringement.',
          'The developer does not warrant that the app will be uninterrupted, error-free or free of harmful components, or that any reminder will be delivered. No promise is made about the quality, suitability or outcome of the app or of any improvement or feature added to it.',
        ],
      },
      {
        heading: 'No responsibility and no claims',
        paragraphs: [
          'You use DeepWork entirely at your own risk. Whatever you do with the app, and whatever results from it, is your own responsibility. The developer is not responsible for anything that happens to you, your device, your data, your work or any other person or property through the use of, or inability to use, DeepWork.',
          'To the fullest extent permitted by law, the developer accepts no responsibility and will not honor any claim of any kind — including a claim for loss, damage, missed reminders, missed deadlines, lost data, lost time, lost profits or business interruption — arising from DeepWork or its use, whether the claim is in contract, tort or otherwise.',
          'Nothing in these terms excludes liability that cannot be excluded by law.',
        ],
      },
      {
        heading: 'Changes to these terms',
        paragraphs: [
          'These terms may be updated as the app changes. The date at the top shows the current version. Continuing to use DeepWork after a change means you accept the updated terms.',
        ],
      },
      {
        heading: 'Governing law',
        paragraphs: [
          'These terms are governed by the laws of India, without regard to conflict-of-law rules. Courts in India have jurisdiction over disputes arising from them.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: ['Questions about these terms can go to contact@therate.dev.'],
      },
    ],
  },
};
