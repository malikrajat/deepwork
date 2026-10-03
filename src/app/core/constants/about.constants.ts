/**
 * Everything the About page says about the developer, in one file.
 *
 * The wording lives here rather than in the template so it can be edited
 * without touching the layout, and so the same sentence reads identically
 * wherever it is used. All of it is public information from rajatmalik.dev.
 */

/** The person behind the app. */
export interface DeveloperProfile {
  name: string;
  /** Shown in the round avatar instead of a photo. */
  initials: string;
  /** Current job title. */
  role: string;
  location: string;
  /** Availability line, shown with a green dot. */
  status: string;
  /** Paragraphs of the introduction, in order. */
  summary: readonly string[];
  /** The one-line promise about answering people. */
  replyNote: string;
}

export const DEVELOPER: DeveloperProfile = {
  name: 'Rajat Malik',
  initials: 'RM',
  role: 'Senior Lead Software Engineer & Frontend Architect',
  location: 'Gurgaon, India · works remotely with teams anywhere',
  status: 'Open to new work',
  summary: [
    'Hello — I am Rajat, the developer of DeepWork. I have spent more than 16 years building and leading software delivery, and I am currently a senior lead software architect working across energy, mobility, parcel and many more domains — expertise I carry into the work I take on, staying hands-on in the code that ships.',
    'I am open to work of almost any shape: a full-time senior or lead role, an architecture or consulting engagement, a contract or freelance project, part-time or fractional support, or a fixed block of hours when your team needs extra hands. I work across the whole stack — web frontends, backends and APIs, desktop applications like this one, and the testing, performance and release practices that hold them together.',
    'If you are hiring, or you have a problem you would like a second opinion on, write to me. Tell me the short version and I will give you a straight answer about fit and how I would approach it.',
  ],
  replyNote: 'I read and answer every message myself, usually within one business day.',
};

/** A way of working together, and what it usually looks like. */
export interface AvailabilityOption {
  title: string;
  description: string;
}

export const AVAILABILITY: readonly AvailabilityOption[] = [
  {
    title: 'Full-time role',
    description:
      'Senior or lead engineer, or architect, at any company — remote, hybrid or on-site.',
  },
  {
    title: 'Contract & freelance',
    description: 'A defined project, a fixed number of hours, or an ongoing retainer.',
  },
  {
    title: 'Part-time & fractional',
    description: 'A few days a week alongside your team, for as long as you need them.',
  },
  {
    title: 'Hourly consulting',
    description:
      'Architecture reviews, performance audits, code reviews, debugging, pairing sessions.',
  },
  {
    title: 'Speaking & workshops',
    description: 'Angular, web performance and frontend architecture for your team or meetup.',
  },
  {
    title: 'End-to-end delivery',
    description:
      'Frontend, backend, APIs, desktop apps and CI/CD — one person who can hold the whole picture.',
  },
];

/** One promise about the analysis DeepWork runs, and what backs it up. */
export interface AiNote {
  title: string;
  detail: string;
}

/**
 * What the app says about the analysis it runs over the user's own records.
 *
 * The Analytics page does not stop at charts: every number is paired with a
 * plain-language reading of it, drawn from the sessions, tasks, habits and
 * journal entries already sitting in the local database. That reading is what
 * these lines are about — it is produced offline, on the machine the app is
 * running on, and nothing is sent anywhere to get it.
 *
 * Deliberately written as a claim about *where the analysis happens* rather
 * than about a model, because that is the part DeepWork can stand behind: no
 * account, no API key, no server of its own, and no data leaving the computer.
 */
export const OFFLINE_AI: {
  headline: string;
  summary: string;
  notes: readonly AiNote[];
} = {
  headline: 'Offline AI',
  summary:
    'DeepWork reads your own sessions, tasks, habits and journal on this machine and turns it into the figures and the plain-language readings on the Analytics page — the "what should I change?" half, not only the charts.',
  notes: [
    {
      title: 'The analysis runs offline',
      detail:
        'No account, no API key, no server of its own: the reading of your data happens on the computer you are sitting at, whether or not it is online.',
    },
    {
      title: 'Your data never leaves',
      detail:
        'Nothing is uploaded, pooled with other people or used to train anything — there is nowhere for it to go, because DeepWork has no backend to send it to.',
    },
    {
      title: 'Every figure is checkable',
      detail:
        'Each number comes from records you can open, export or delete yourself, so you can always see what the reading was drawn from.',
    },
  ],
};

/** How a link is drawn and grouped: the icon and the label both come from it. */
export type ContactKind = 'email' | 'website' | 'linkedin' | 'github' | 'chat' | 'writing';

/** A way to reach the developer. */
export interface ContactLink {
  kind: ContactKind;
  label: string;
  /** What is shown under the label — a handle, an address, a short promise. */
  value: string;
  url: string;
}

export const CONTACT_LINKS: readonly ContactLink[] = [
  {
    kind: 'email',
    label: 'Email',
    value: 'mr.rajatmalik@gmail.com',
    url: 'mailto:mr.rajatmalik@gmail.com?subject=DeepWork%20—%20role%20or%20project%20enquiry',
  },
  {
    kind: 'website',
    label: 'Portfolio',
    value: 'rajatmalik.dev',
    url: 'https://rajatmalik.dev/',
  },
  {
    kind: 'linkedin',
    label: 'LinkedIn',
    value: 'in/errajatmalik',
    url: 'https://www.linkedin.com/in/errajatmalik/',
  },
  {
    kind: 'github',
    label: 'GitHub',
    value: 'github.com/malikrajat',
    url: 'https://github.com/malikrajat',
  },
  {
    kind: 'chat',
    label: 'WhatsApp',
    value: '+91 800-387-4742 · 10:00–20:00 IST',
    url: 'https://wa.me/918003874742',
  },
  {
    kind: 'writing',
    label: 'Medium',
    value: '@codewithrajat',
    url: 'https://medium.com/@codewithrajat',
  },
];
