# SEO and AdSense: what is in the repository, and what only the account owner can do

This page is the runbook for `app.deepwork.rajatmalik.dev`. It covers the
technical work that is already committed, the steps that have to happen inside
Google AdSense, Search Console and Bing, and the honest limits of what a code
change can achieve.

The short version: the repository now has a crawlable content layer, a correct
privacy policy, `ads.txt`, publisher verification, a sitemap and robots rules.
AdSense approval is still a review decision made by Google. No file in this
repository can guarantee it, and no change here can create traffic or reviews.

---

## 1. What is in the repository

| File / folder | What it does |
| --- | --- |
| `public/ads.txt` | Authorises Google AdSense (`pub-4991682021863699`) to sell ads on this domain. |
| `public/guides/` | Six original, long-form guides and a hub. Static HTML, real 200 responses, unique titles, descriptions, canonicals and structured data. |
| `public/about-deepwork/` | A static About page: what the app is, who builds it, where the data lives, and its limits. |
| `public/privacy-policy/` | The full privacy policy, including analytics, cookies, AdSense, consent and rights. |
| `public/terms-of-use/` | The terms of use, including advertising and third-party links. |
| `public/contact-us/` | A static contact page with support, corrections and privacy routes. |
| `public/editorial-policy/` | How the guides are written, sourced, corrected and funded; no UGC, no incentivised clicks. |
| `public/advertising-policy/` | The public statement of where ads appear, manual placement rules, invalid-traffic rules, content standards, consent and reporting. |
| `public/robots.txt` | Allows search crawlers, `Mediapartners-Google` and `AdsBot-Google`; names the sitemap. |
| `public/sitemap.xml` | Every static page that answers 200. Application routes are deliberately excluded (GitHub Pages answers them with a 404 status). |
| `public/llms.txt` | The plain-text guide for assistants, now listing the guides and the advertising boundary. |
| `src/index.html` | Adds the `google-adsense-account` meta tag, fixes the stale `softwareVersion`, and links the guides from the no-JavaScript fallback. It does **not** load ad code. |
| `src/app/core/services/seo-title.strategy.ts` | Sets the document title, description, Open Graph/Twitter tags and canonical URL per Angular route. |
| `src/app/app.routes.ts` | Gives every route a title, a description and, for dated journal entries, an undated canonical path. |
| `src/app/core/constants/legal.constants.ts` | The in-app privacy and terms text, brought in line with what the site actually does. |
| `public/_headers` | CSP allowlist extended for AdSense, GA4's `www.google.com` collect endpoint and Cloudflare Web Analytics. |
| `scripts/check-seo.mjs` | Fails the build if `ads.txt`, the sitemap, metadata, canonical URLs, structured data, internal links, the privacy disclosures or the CSP lose their required pieces. |

The advertising boundary is deliberate: **the six guide articles load AdSense,
and nothing else does.** The application is a tool, not editorial content; the
guide index is a navigation screen; the policy pages are legal/trust documents.
Google's inventory-value policy does not allow ads on screens used for
navigation or screens without publisher-content, and its ad-placement policy
does not allow ads in software. The AdSense script is present only on the six
article pages, and the articles use manual in-article units rather than Auto
ads, so a unit cannot land on the header, a download button or the closing
call to action.

---

## 2. The steps only the account owner can do

### 2.1 Deploy first

```bash
git add .
git commit -m "Add crawlable guides, ads.txt and AdSense-ready policies"
git push origin main
```

The GitHub Actions workflow builds and publishes the site. Wait for the deploy
to finish, then check the live files:

```powershell
Invoke-WebRequest https://app.deepwork.rajatmalik.dev/ads.txt | Select-Object -Expand Content
Invoke-WebRequest https://app.deepwork.rajatmalik.dev/robots.txt | Select-Object -Expand Content
Invoke-WebRequest https://app.deepwork.rajatmalik.dev/sitemap.xml | Select-Object -Expand Content
```

`ads.txt` must return the `google.com, pub-…` line, not the app shell. If it
returns HTML, the file was not deployed.

### 2.2 Verify the site in AdSense

1. Open **AdSense → Sites**.
2. Add `app.deepwork.rajatmalik.dev` if it is not already listed.
3. Choose verification by **AdSense code** or **ads.txt**. Both are present:
   - the meta tag is in `src/index.html` and every static page;
   - `https://app.deepwork.rajatmalik.dev/ads.txt` contains the publisher line.
4. Click **Verify**. Google may take from a few minutes to a couple of days.

If verification fails, check the live `ads.txt` first. GitHub Pages caches, and
so does Cloudflare; a hard refresh of the URL is the quickest way to see which
copy is live.

### 2.3 Request the review

Only request a review once the site is deployed and the verification is green.
AdSense reviews the domain, not a single page. The reviewer will land on `/`,
which is the application shell, and then look for the content and policy pages.
That is what `/guides/`, `/about-deepwork/`, `/privacy-policy/` and the rest
exist for.

**Be honest with yourself about the likely outcome.** AdSense rejects tool and
app domains for "low value content" when there is not enough original text on
the domain. Six substantial guides are a real foundation, but they are not a
large library. The most reliable way to pass is to keep publishing original
guides — two to four a month, each genuinely useful and not a rewritten search
result — and to request a review after that. Applying again too soon does not
reset the content problem.

### 2.4 Privacy & messaging (consent)

This is required for visitors in the EEA, the UK and Switzerland, and it is the
part most sites forget.

1. In AdSense, open **Privacy & messaging → GDPR**.
2. Create a message for the domain, choose the languages, and publish it.
3. Google's certified consent message is the simplest compliant option. It
   handles the consent record and the personalised/non-personalised choice.
4. If you also serve US states with privacy laws, create the **US state
   privacy** message in the same section.
5. Do not add a second, homemade cookie banner that blocks the AdSense script
   before Google's message can appear. Two banners do not make a site more
   compliant; they make it unclear which choice counts. If you want a
   first-party banner as well, it has to integrate with Consent Mode rather than
   pre-empt the certified CMP.

The privacy policy in this repository already describes the cookies, the
consent message, the opt-outs and the rights. Keep it in step if the ad setup
changes.

### 2.5 Use manual in-article units, not Auto ads

**Do not enable Auto ads for this site.** Auto ads choose their own positions.
On these pages that means a unit can appear beside the header navigation, the
"Open the web app" button, the "Download a desktop build" link in the closing
call to action, or the guide index. Google's *ads interfering* and *ad placement*
policies prohibit ads that sit next to navigation or action items and ads on
screens used for navigation, and an accidental-click finding is a policy
violation even when the layout did it without intent.

Use manual units instead:

1. Create one responsive **display** ad unit in AdSense and copy its
   `data-ad-slot` value.
2. Add a block like this **inside an article body**, after the second or third
   section — never above the first paragraph, never in the header, footer,
   byline, guide index or call-to-action band:

   ```html
   <div class="ad-slot">
     <ins
       class="adsbygoogle"
       style="display:block"
       data-ad-client="ca-pub-4991682021863699"
       data-ad-slot="REPLACE_WITH_SLOT_ID"
       data-ad-format="auto"
       data-full-width-responsive="true"
     ></ins>
     <script>
       (adsbygoogle = window.adsbygoogle || []).push({});
     </script>
   </div>
   ```

3. The `.ad-slot` class in `public/guides/guides.css` adds a visible
   "Advertisement" label and vertical spacing. Use at most **two** units per
   article. The smallest article is about 1,600 words, so two units is still
   content-first.
4. Keep at least one paragraph of text between the unit and any link, button or
   heading. Do not put an image directly beside an ad, do not style the unit to
   look like a card or a search result, and do not animate it.

`scripts/check-seo.mjs` refuses an ad page under 1,000 words, an iframe, an
auto-refresh, an ad inside the call-to-action band, and any "click our ads"
style incentive language. It cannot judge visual proximity; that part is the
review step above.

If you already enabled Auto ads, turn it off in **Ads → By site → Auto ads**
before adding manual units.

### 2.6 Search Console and Bing

Google Search Console is already verified with the `google-site-verification`
meta tag in `src/index.html`.

1. Open **Search Console → Sitemaps** and submit
   `https://app.deepwork.rajatmalik.dev/sitemap.xml`.
2. Use **URL inspection** on `/guides/` and each guide, and request indexing.
   Do this after the deploy, not before.
3. Check **Pages** after a few days. The app routes will report "Not found
   (404)" because GitHub Pages answers them that way; that is expected and is
   why they are not in the sitemap. The static pages should report "Indexed".
4. In **Bing Webmaster Tools**, add the site and submit the same sitemap. Bing
   also feeds some AI answer engines.

### 2.7 Keep publishing

AdSense wants a site that is more than a product page. The guides already
target the questions people ask before they want a timer:

- what the Pomodoro Technique is;
- how to time-block a day;
- how the Eisenhower matrix works;
- how habit streaks actually form;
- how to choose a timer that does not need an account;
- what a deep work routine looks like.

Useful next topics, in the same honest voice:

1. A realistic comparison of a Pomodoro timer, a time tracker and a task manager
   — three different jobs, not three brands.
2. How to run a weekly review in twenty minutes.
3. What to do when a focus session is interrupted every ten minutes.
4. Browser storage versus a local database: what "your data stays on your
   machine" means in practice.
5. How to import an existing task list from Excel or CSV without losing dates.
6. Why a timer should ring until it is answered, and when that is annoying.
7. A guide to the Eisenhower matrix for developers, with real ticket examples.
8. How to plan a day around meetings you cannot move.
9. What to track in a focus log, and what is noise.
10. A local-first backup routine: export, store, restore, test.

Each new guide should get a title, a description, a canonical URL, an `Article`
+ `BreadcrumbList` + `FAQPage` JSON-LD graph, the AdSense meta tag and script,
and an entry in `public/sitemap.xml` and `public/guides/index.html`. Then run
`npm run check:seo`.

### 2.8 Reviews and traffic, honestly

The request mentions "unique reviews start coming". There is no setting that
makes reviews arrive, and inventing them would be both dishonest and a Google
policy violation. The repository deliberately contains no rating, no
`aggregateRating`, no testimonial and no customer count.

What actually helps:

- Ask people who use the app to leave a review on the platform where they found
  it (GitHub, Product Hunt, AlternativeTo, a relevant community). Ask once, and
  never pay for a review.
- Publish the guides where the audience already is, with a link back. A guide
  nobody links to will not rank.
- Keep the app's GitHub README, releases and screenshots current; they are
  often the first result for the project name.
- Answer issues and messages. A visible, responsive maintainer is a trust signal
  that no schema markup can fake.

### 2.9 Policy compliance map

The policy chain that starts at
<https://support.google.com/adsense/answer/48182> was read through its eight
sections plus the publisher-policy pages. This is what applies to this site and
where it is handled.

| Policy page | Requirement | How this site complies |
| --- | --- | --- |
| AdSense Program policies | No invalid clicks; no incentivised clicks; no paid-to-click, autosurf or click-exchange traffic; ad code only in permitted places; no ads on non-content pages, in software, pop-ups, emails, private communication or frames. | No incentives anywhere; no paid traffic; ad tag only on six 1,600–2,100-word articles; app, hub and policy pages have no ad code; no iframes, pop-ups or auto-refresh. |
| Families / COPPA | Sites directed to children must tag ad requests; no interest-based ads to under-13s. | General-audience productivity site; not child-directed; not tagged for child treatment; stated in privacy and advertising policy. |
| Monetization and ads — invalid traffic | Publisher is responsible for traffic quality; no self-clicks, bots or paid traffic. | Developer does not click live ads; no traffic purchase or automation; stated in advertising policy. |
| Privacy and security — UGC | Publisher is responsible for user-generated content on ad pages. | No public comments, forums, profiles or reviews; contact messages are private; app data is local. |
| LGPD | Brazil data-subject rights and legal bases. | LGPD section in the privacy policy. |
| Ad implementation guidelines | Ad placement rules; no accidental clicks; no ads near navigation/download; no auto-refresh; no ads in software, private communication, emails, frames, pop-ups; label only "Advertisements"/"Sponsored Links". | Manual in-article units; label `Advertisement`; no unit in header/footer/CTA; no iframes/pop-ups/auto-refresh; app has no ad code. |
| Modifications of AdSense ad code | Do not alter the tag to inflate performance, hide units, cover content or manipulate targeting. | Standard async snippet used unchanged. |
| Product-specific policies | AdMob/AdSense for Search rules; no ads in apps or compensation programs. | Web AdSense display only; no AdMob; no rewards or compensation. |
| AdSense policy FAQs | Ads above the fold allowed only with enough content; no ads under download/nav; no iframes; web apps need supported WebView. | Content starts above the fold; no ads near CTAs; no frames; the app opens guides in the user's browser and carries no ad code. |
| Google Publisher Policies | Prohibited content; dishonest declarations; ads interfering; inventory value; replicated content; privacy disclosures; cookies on Google domains; identifying users; device/location; COPPA; spam; abusive experiences; malware; Better Ads; authorised inventory. | Original content, accurate `ads.txt`, no sensitive/prohibited categories, no PII to ad systems, privacy policy with Google's required language, no pop-ups/malware, `ads.txt` lists only Google. |
| Google Publisher Restrictions | Restricted categories may receive fewer or no ads. | The site has none of the restricted categories (sexual, shocking, weapons, tobacco, drugs, gambling, prescription drugs, etc.). |
| Required content | Privacy policy must contain the three Google advertising-cookie disclosures, vendor/opt-out information and a link to "How Google uses data". | All are in `/privacy-policy/`; the check script verifies the exact phrases and the link. |

Two owner-only tasks remain:

1. **GTM user-provided data.** The GTM container has automatic email/phone/address
   detection enabled. Turn off **Automatically detect user-provided data** (or
   exclude the contact form) in the container, so Google Analytics is not sent
   data that Google's *Identifying users* policy could treat as PII.
2. **Keep the placement manual.** Do not switch on Auto ads, do not click your
   own live ads, and do not buy traffic.

---

## 3. Where the publisher ID lives

The value `ca-pub-4991682021863699` / `pub-4991682021863699` appears in:

- `public/ads.txt`
- `src/index.html` (the `google-adsense-account` meta tag)
- every page under `public/guides/` (meta tag and AdSense script)
- the other static pages (meta tag only)
- `scripts/check-seo.mjs` (`PUBLISHER_ID`)

If the account changes, change all of them. `npm run check:seo` fails if the
meta tag and `ads.txt` disagree.

The tag is intentionally **not** in `public/about-deepwork/`,
`public/privacy-policy/`, `public/terms-of-use/`, `public/contact-us/` or
`public/editorial-policy/`. Those pages carry the verification meta tag but not
the ad script.

---

## 4. What the policy pages now say, and why

The previous in-app policy said "no analytics, no tracking, no advertising".
That was no longer true: the application page loads Google Tag Manager, which
loads GA4 (`G-L6WB5FHKPQ`), and the site was about to carry AdSense. A policy
that contradicts the network tab is a review problem and a legal one.

The new policy:

- separates **what the app stores locally** from **what the website collects**;
- names GitHub, Cloudflare, Google Analytics 4, GoatCounter, Web3Forms and
  hCaptcha;
- lists the analytics and advertising cookies, with lifetimes and purposes;
- describes personalised versus non-personalised ads and the consent message;
- gives the Google Ads Settings, aboutads.info and youronlinechoices.eu
  opt-outs;
- states the GDPR/UK GDPR bases and rights, and the CCPA/CPRA position
  (including "we do not sell");
- explains that the developer cannot access or delete data held inside your copy
  of the app.

The static page is the canonical, crawlable version. The in-app text is kept in
step by hand; if you change one, change the other. The check script asserts that
the static privacy page still mentions AdSense, cookies, consent and the contact
address, and that the terms still mention MIT, advertising and contact.

---

## 5. Maintenance

Run this before every deploy:

```bash
npm run check:seo
npm run check:headers
```

`npm run verify` runs lint, the CSS audit, the unit tests, the production build,
the header check and the SEO check. The new `seo-title.strategy.spec.ts` covers
the per-route title, description, canonical and the dated-journal exception.

When you add a guide:

1. Copy the head and footer from an existing **article** (not the hub). Change
   the title, description, canonical, `Article`/`FAQPage` JSON-LD and dates.
2. Write at least 1,000 words of original content; the check fails below that.
   Keep at most two manual ad units, both inside the article body.
3. Add the card to `public/guides/index.html`. The hub itself stays ad-free — do
   not copy the AdSense script into it.
4. Add the URL to `public/sitemap.xml`.
5. Run `npm run check:seo`.
6. Deploy, then request indexing in Search Console.

When the content changes materially, move the `dateModified`, the visible
"Updated" line, the sitemap `lastmod` and the policy date together. A date that
moves without the content moving is a small lie that crawlers learn to discount.

---

## 6. What this does not fix

- **Google's decision.** Approval is discretionary. A complete technical setup
  can still be rejected for content quality, traffic or account history.
- **Traffic.** Content can earn search traffic over months; it does not create
  an audience on the day it ships.
- **Reviews.** They have to come from real users. Do not generate them.
- **The rest of the domain.** `deepwork.rajatmalik.dev` is a separate
  repository and deployment. It already has a prerendered page, its own privacy
  policy and its own llms.txt. If that domain is also under review, apply the
  same checks there: ads.txt, CMP, a content library, and no ads on pages
  without content.
- **A custom cookie banner.** Google requires a certified CMP for EEA/UK ad
  consent. Use Google's Privacy & messaging, or another certified CMP; a
  hand-rolled banner alone is not a substitute.
- **The host's terms.** The app is published with GitHub Pages. GitHub's Pages
  terms are aimed at project sites, not an ad-funded business. If GitHub or
  AdSense raises the host, moving the same `dist/deepwork/browser` folder to
  Cloudflare Pages is a drop-in change; `public/_headers` is already written for
  Pages, and `docs/deployment.md` covers the build.
- **A guaranteed review.** The site now satisfies the technical and policy
  requirements that can be satisfied in code. The content library, the account
  history and Google's judgement are still outside the repository.
