/**
 * The text of the two policy pages, in one place.
 *
 * Both documents describe what this build actually does: data stays on the
 * machine, the analysis runs offline, and the network calls are the update
 * check, the links the user chooses to open, the disclosed analytics, and the
 * advertising on the written guides. Keeping the wording here means the pages
 * can be updated without touching their layout, and the shared sentences cannot
 * drift apart.
 *
 * The same policies are also published as static HTML at `/privacy-policy/` and
 * `/terms-of-use/`, because GitHub Pages answers an application route with the
 * app shell under a 404 status and a policy has to be readable without
 * JavaScript. When this text changes, change the static pages too;
 * `scripts/check-seo.mjs` fails if the two copies lose the same required
 * disclosures.
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
    subtitle: 'Your work stays on your device. The website explains exactly what it collects.',
    updated: '17 November 2026',
    sections: [
      {
        heading: 'The short version',
        paragraphs: [
          'The DeepWork application collects no data about you. There is no account, no sign-up, no telemetry on your work and no payment. Everything you create — tasks, focus sessions, habits, journal entries and settings — is stored only on the device you run the app on.',
          'This website is different from the application. It uses analytics to count visits and, on the written guide pages only, Google AdSense to show advertising. The sections below describe both, including the cookies involved and how to refuse them.',
        ],
      },
      {
        heading: 'Who is responsible',
        paragraphs: [
          'The data controller is Rajat Malik, an individual developer based in India. Questions, requests and complaints can be sent to contact@rajatmalik.dev.',
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
          'On the desktop app the database is a SQLite file on your machine, inside the application-data directory of your operating system. In the browser build it is kept in that browser’s local storage for the address you opened it from. The browser copy is not a cookie and is not sent to this website.',
          'You can export or delete records from inside the app. Removing the app, clearing the browser’s site data or deleting the database file removes those records with it. DeepWork does not keep a copy anywhere else.',
        ],
      },
      {
        heading: 'What leaves your device',
        paragraphs: [
          'There is no DeepWork account and no DeepWork backend. Your tasks, sessions, habits and journal are never uploaded.',
          'The application makes these network requests, and only when needed:',
        ],
        bullets: [
          'Update checks: the desktop app asks GitHub’s public release API whether a newer version exists. The request carries no personal data from DeepWork; like any web request, GitHub can see the IP address it came from and when it was made.',
          'Downloads and links: installers and release notes open on GitHub, and the browser build is served by GitHub Pages through Cloudflare. Following a link to another site takes you to a service with its own privacy policy.',
          'Analytics: the application page loads Google Tag Manager and Google Analytics 4 to count page views and interaction events such as scrolls, outbound clicks, downloads and form interactions. Email addresses in event data are redacted, Google Signals is disallowed, and Google Analytics 4 does not store full IP addresses.',
          'Visit counter: the web build also uses a first-party GoatCounter counter, which is cookie-less and does not store IP addresses. It can be turned off in Settings, and it honours Do Not Track and Global Privacy Control.',
          'Cloudflare Web Analytics is injected by the host. It is cookie-less and reports aggregate page views and performance, not individual visitors.',
        ],
      },
      {
        heading: 'Cookies',
        paragraphs: [
          'The application’s own data is kept in browser storage, not in cookies. Cookies come from the third-party services described here.',
          'Google Analytics 4 sets _ga and _ga_* cookies (up to two years) and _gid (24 hours) to distinguish visitors and sessions. Google AdSense and its partners set cookies such as IDE, test_cookie, __gads, __gpi and __eoi to cap frequency, prevent fraud, measure ad performance and, where you consent, personalise advertising. Names and lifetimes are controlled by Google and can change.',
          'GoatCounter and Cloudflare Web Analytics set no cookies.',
        ],
      },
      {
        heading: 'Advertising on the written guides',
        paragraphs: [
          'The six guide articles on this domain load Google AdSense. The application interface, the guide index and the policy pages do not load ad code, and no task, focus session, habit or journal entry is ever sent to an advertiser. The placement rules are in the advertising policy at /advertising-policy/.',
          'Third party vendors, including Google, use cookies to serve ads based on a user’s prior visits to this website or other websites. Google’s use of advertising cookies enables it and its partners to serve ads based on visits to this site and/or other sites on the Internet. Google’s ad serving may use cookies, web beacons, IP addresses and other identifiers.',
          'Users may opt out of personalized advertising by visiting Google Ads Settings at adssettings.google.com. Alternatively, users can opt out of a third-party vendor’s use of cookies for personalised advertising at aboutads.info/choices. Google may use third-party vendors and ad networks; they are described in Google’s partner sites documentation at policies.google.com/technologies/partner-sites, and their own sites offer opt-outs where available.',
          'If you are in the European Economic Area, the United Kingdom, Switzerland or Brazil, a Google-certified consent message asks for permission before personalised advertising cookies are used; you can refuse and still see non-personalised ads. Non-personalised ads may still use cookies for frequency capping, aggregate reporting and fraud prevention.',
          'We do not pass personal information to Google’s ad systems, do not upload customer lists, and do not try to identify users or merge identities. Google explains how it uses data from partner sites at google.com/policies/privacy/partners.',
        ],
      },
      {
        heading: 'Notifications and reminders',
        paragraphs: [
          'Focus, water, movement and standing reminders are scheduled locally by the app and delivered through your operating system’s notification system. No push server is involved and no reminder content is sent anywhere.',
        ],
      },
      {
        heading: 'If you contact the developer',
        paragraphs: [
          'If you send an email, the address you write from and anything you include are used only to read and answer your message. They are not added to a mailing list, sold or shared, except where the law requires it. You can ask for the correspondence to be deleted at any time.',
          'Messages sent through the contact form are delivered by Web3Forms, an email relay that hands the name, address and message to this developer’s inbox. The form also uses hCaptcha to reduce spam. Both process the information only to make that delivery and protect the form, under their own privacy policies.',
        ],
      },
      {
        heading: 'The analysis on the Analytics page',
        paragraphs: [
          'The figures and plain-language readings on the Analytics page are calculated on your machine from your own records. There is no account, API key or remote model involved, and the analysis is not uploaded, pooled with other people or used to train anything.',
        ],
      },
      {
        heading: 'Your rights',
        paragraphs: [
          'Depending on where you live, you may have the right to access, correct, delete or restrict the processing of your personal data, to object to processing, to data portability, and to withdraw consent. You also have the right to complain to your local data protection authority. Write to contact@rajatmalik.dev to exercise any of these.',
          'California residents have the right to know what personal information is collected, to delete it, to correct it, and to opt out of its sale or sharing. We do not sell personal information; to opt out of advertising cookies, use the controls in the advertising section above.',
          'If you are in Brazil, the LGPD gives you the right to confirm processing, access, correct, anonymise, block or delete data, portability, information about sharing, and withdrawal of consent. Write to contact@rajatmalik.dev, or contact the Brazilian National Data Protection Authority (ANPD).',
          'Because the application stores its data on your device, the developer cannot access, export or delete your tasks, sessions or journal entries. You can do that from inside the app.',
        ],
      },
      {
        heading: 'Data retention and international transfers',
        paragraphs: [
          'Analytics reports are retained according to the settings of the Google Analytics property and GoatCounter account, typically for a limited period. Advertising data is retained by Google under its own policies. Contact messages are kept only as long as needed to answer them.',
          'GitHub, Cloudflare, Google, Web3Forms and hCaptcha operate from the United States and other countries. Their processing may involve transferring data outside your country, under the safeguards described in their own privacy policies.',
        ],
      },
      {
        heading: 'Children and user-generated content',
        paragraphs: [
          'DeepWork is a productivity tool for general use and is not directed at children under 13. It is not tagged for child-directed ad treatment, and we do not use interest-based advertising or remarketing based on activity by users known to be under 13. The app does not knowingly collect personal information from anyone, including children.',
          'The website has no public comments, forums, profiles or reviews visible to other visitors. Contact-form messages are private correspondence. The application’s tasks, habits and journal entries stay on the user’s own device and are never visible to another user.',
        ],
      },
      {
        heading: 'Changes to this policy',
        paragraphs: [
          'If the way DeepWork handles data changes, this page will be updated and the date at the top changed. Material changes — for example, adding a new advertising partner — will be described rather than quietly applied.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: ['Questions about this policy can go to contact@rajatmalik.dev.'],
      },
    ],
  },
  terms: {
    id: 'terms',
    title: 'Terms & conditions',
    subtitle: 'Free software, provided as-is, used entirely at your own risk.',
    updated: '17 November 2026',
    sections: [
      {
        heading: 'Acceptance',
        paragraphs: [
          'By installing, opening or using DeepWork, or by reading this website, you agree to these terms. If you do not agree, do not use the app or the site.',
          'If you use DeepWork, you do so entirely at your own risk. Whatever you do with the app, and whatever results from it, is your own responsibility.',
        ],
      },
      {
        heading: 'No charge',
        paragraphs: [
          'DeepWork is free. There is no subscription, purchase price, in-app payment or fee of any kind, and the developer does not charge you or take money from you.',
          'The application does not collect data about you. There is no account, no telemetry on your work and no payment. Whatever you do in DeepWork stays on your device.',
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
        heading: 'Advertising and third-party links',
        paragraphs: [
          'The six guide articles on this website carry advertising served by Google AdSense. The application interface, the guide index and the policy pages do not load ad code. Advertisers cannot pay for a mention, a review or a ranking, and advertising does not decide what gets published. The full placement rules are at /advertising-policy/.',
          'The site does not ask anyone to click or view an ad, does not offer compensation or rewards for doing so, and does not buy traffic or use paid-to-click, autosurf, click-exchange or automated traffic. Clicks on ads must come from genuine interest.',
          'Clicking an advertisement or an outbound link takes you to a service with its own terms and privacy policy. The developer does not control those services and is not responsible for their content, products, availability or handling of your data.',
        ],
      },
      {
        heading: 'Your data and backups',
        paragraphs: [
          'Your records belong to you and stay on your device. You are responsible for keeping backups of anything you cannot afford to lose.',
          'Uninstalling the app, clearing browser data, deleting the database file or resetting the application data can permanently remove your records. DeepWork cannot restore them because it never had a copy.',
          'The developer has no access to your data and cannot recover, correct or remove it for you.',
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
          'The developer does not warrant that the app or the site will be uninterrupted, error-free or free of harmful components, or that any reminder will be delivered. No promise is made about the quality, suitability or outcome of the app or of any improvement or feature added to it.',
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
        paragraphs: ['Questions about these terms can go to contact@rajatmalik.dev.'],
      },
    ],
  },
};
