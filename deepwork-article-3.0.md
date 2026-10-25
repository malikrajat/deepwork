# Everyone Talks About Deep Work. Almost Nobody Measures It.

*I built a focus timer for myself. The latest version answers the question every other timer ignored: what did those hours actually buy?*

---

It is 9:40 on a Tuesday night and the screen in front of me says **7h 30m**.

Fourteen focus sessions. Twelve active days. Four tasks.

I should feel good about this. Instead I am sitting there unable to answer a much simpler question: *what did I actually finish?*

My task board had plenty of ticks on it. My timer had fourteen completed sessions. Neither one could tell me which work those hours paid for. Between "I was busy" and "this mattered" there was a gap the width of a week, and no app I owned had ever tried to close it.

That gap is what this article is about.

## The timer was never the problem

I have owned a lot of focus timers. The pomodoro kitchen timer. The app with the little tree. The one built into my phone. The one I wrote myself and then rewrote twice.

They all work. They count down, they ring, they give you a number at the end of the day.

Counting is the easy part. The hard part is meaning.

Every timer I have used answers *how long did you focus?* None of them answered *what did that focus pay for?* So for the last year I have been building the page that does — and the latest version of DeepWork is the first release where I think the app finally earns the name.

## Stop Guessing Where Your Day Went

Here is the problem that started it.

I do code review most weekdays. In a task list, that is a new row every single day: *Code review* on Monday, *Code review* on Tuesday, *Code review* on Wednesday. Twenty rows a month. When I finally asked "how much of my life does code review actually take?", counting rows gave me nothing useful. It gave me twenty small numbers.

The new **Time by Task** page groups sessions by the work, not by the row. One line: **Code review — 3h 20m, 8 sessions, 8 days**, first session 26 September, last 17 October, and the word *repeats weekly* underneath it.

![Time by Task page showing 7h 30m tracked all time across four tasks, with Code review at 3h 20m](shots/time-page.png)

*Seven and a half hours, four tasks, and one sentence at the top that explains the shape of the week.*

The part I did not expect to care about is the box at the top, the one that writes the reading for you:

> Your largest tracked task this period was Code review: 3h 20m across 8 sessions on 8 days. It repeats weekly, so it is the work worth protecting a slot for.
>
> 74% of this period went to work that repeats — 5h 35m on 11 sessions.

That is not a chart. That is a sentence I can act on before lunch.

The question changes from "where did the day go?" to "which of these deserves a calendar slot?" That is a decision you can make in ten seconds, instead of a feeling you carry around all week.

## What If Your Timer Told You What Your Time Was Worth?

Worth is a dangerous word, so let me be precise about what I mean. Not money. Not points. Just this: *did the hours go to work that repeats, work that was one-off, work that spanned days, or work you never assigned at all?*

The page answers that with colour and nothing cleverer than colour. Violet for repeating work. Amber for one-off. Blue for multi-day. Slate for untasked. A ring around a bar means the current day, week, month or year. The legend above the list says all of it, so you never have to remember.

Then I opened my own numbers and got embarrassed.

*Write the proposal* — the thing I would have called my real work that month — was **50 minutes**. One session. One day. Code review, the thing I think of as the chore between real work, was **3h 20m**. Four times as much.

![Time by Task page showing Sprint planning at 2h 15m and Write the proposal at 50m](shots/time-page.png)

*The uncomfortable comparison, sitting in the same list. The work I was proud of got fifty minutes. The work I call routine got three hours and twenty.*

I am not telling you the answer was wrong. I am telling you I had never seen the question. Maybe code review is load-bearing and deserves the slot it already takes. Maybe the proposal deserved more. Both are decisions. Guessing is not a decision — it is just a habit with better branding.

The window is not fixed, either. **Today**, **This week**, **This month**, **This year**, **All time**, and **Custom** with two date fields — pick the same day twice to read a single strange day, or two dates to read any span. Open a row and you get the breakdown table, the averages, and the individual sessions behind the total.

And when time is recorded with no task attached, it does not vanish into a rounding error. It appears as **Untasked focus**, with the one sentence that fixes it next time. The page is honest about its own blind spot, which is rarer than it should be.

## A day with it, from the first block to the last

Everything above is what the app tells you afterwards. This is what it does while the day is happening — and the point of all of it is the same: take the noise out of the room so the one thing in front of you is the only thing in front of you.

**Morning: decide what actually matters.** You open DeepWork and land on the Dashboard: a ring waiting to fill, today's tasks underneath it, and the day's schedule in one line. The **Matrix** is the Eisenhower grid — four quadrants you drag cards between, so the fifteen-second decision about what is genuinely urgent happens before the day starts making it for you. The **Today** page is the short version: anything due today, anything overdue and still open, and anything you starred, which is how you say *this one, today, whatever the date says*.

**The block: one thing, and a ring that fills.** Press start, or press space. The ring fills. The app stays quiet until the block actually ends — no badges, no nudges, no "while you were away". When it does end, it rings, shows a card, and posts a notification, and it keeps ringing until you answer it. Start, skip and stop all count as answers. A break is reserved and never filled with work, because that is the entire point of a break.

**The middle of the day: shrink it and forget it.** This is the part that removes the most noise. Minimise the window and it does not vanish into the taskbar — it becomes a small always-on-top widget with the countdown, the time, and play, skip, stop. It sits over your editor while you work. **Focus mode** hides the navigation and leaves the timer and nothing else. A pause holds the timer and every reminder; a mute is sound only and ends by itself. Closing the window sends it to the tray and everything keeps running, so a session can finish and ring while the window does not exist. Nothing is enabled behind your back: the first launch asks about start-with-system, always-on-top and tray, and does nothing unless you say yes.

**Evening: the part that tells you what to change.** Focus over seven days, with a line about the seven before it. Completion rate over thirty days, next to what is still open and what is overdue. Habit streaks. Journal words over twelve weeks, and the correlation between the days you wrote and the days you focused more. Every figure carries its reading in plain language, so you are not left squinting at a chart and feeling vaguely bad about it.

Those readings are arithmetic over your own records, computed on your machine. Same records, same reading, every time. There is no AI and no guessing — which means you can open the records any sentence came from and check it yourself.

## The reminder that outlives your laptop

Now the story that changed how I think about the whole app.

A presentation at 9:00. I set a reminder the night before, closed the laptop at 8:40, and walked into a room with no laptop in it. Every timer-based reminder I have ever used dies exactly there, because a timer needs something to be running.

A stored record does not. When I opened the laptop again, the card was still waiting, and it said the thing I did not know I needed to read:

> It was due at 09:00. We kept it for you.

That is the **Reminders** page — built for the moments when you are standing in front of a room and cannot answer. It escalates instead of repeating on a stopwatch: three minutes, five, ten, fifteen, twenty, then every thirty minutes if you have set it to *Insistent*. It measures from the last real ring, so a snooze cannot quietly shorten the gap.

There is no close cross on the card and no timeout. Only three exits: **Done**, **Snooze 10 min**, **Stop reminding** — the same three answers the desktop notification carries. And it never brings the window forward, because the moments it exists for are exactly the moments when stealing your focus would be the opposite of help.

You stop being the memory. Not the remembering of the thing — the holding of it, all day, in the back of your head.

## Where you can use it

The whole app runs at **[deepwork.rajatmalik.dev](https://deepwork.rajatmalik.dev)**. Three ways in, depending on where you are sitting:

**In a browser tab.** Open the site and start. No account, no sign-in, no email field, nothing to configure first. This is the fastest way to find out whether the shape of the app matches the shape of your day.

**On your phone.** Open the same address in your phone's browser and choose **Add to Home Screen** from the share or menu button. It opens full screen without browser chrome, keeps its own icon, and works offline once it has loaded — so the timer and your tasks are there on a train or in a room with no signal. The same Pause, mute and focus panel opens from the phone's top bar, so the controls you use at your desk are the controls you get in your hand.

**As a desktop app.** While you are in the app, open **About → Get it on another device** and it offers the build for the machine you are on — Windows, macOS or Linux. The desktop version is the one with the tray, the always-on-top mini widget and start-with-system, and it keeps its database in a single file on your own disk. Nothing to log into, nothing to cancel, and nothing that can take your history away when a pricing page changes.

Your data stays with you in all three. The browser and phone versions keep it in that browser's own storage, so export a backup from **Settings** before clearing site data. The desktop version keeps the real database on your machine, and the same **Settings → Export** writes a single dated JSON file you can restore anywhere.

## What it does not do

I would rather you decide with the whole picture.

- **It does not sync between devices.** Each machine keeps its own records. Moving your work means exporting the backup on one and importing it on the other.
- **It is not a team tool.** One person, one set of records. No sharing, assignment or comments.
- **The browser and phone versions are the most disposable of the three.** Clearing site data clears them, so keep a backup.
- **There is no AI.** Every reading is arithmetic you can check.
- **The installers are not code-signed yet.** Windows may say *Unknown publisher* and macOS may refuse the first launch. That is a missing signature, not a broken download — and the browser version needs no signature at all.

If those are deal-breakers, that is a fair answer, and the browser is still there if you want to look before deciding.

## Back to 9:40 on Tuesday

Same screen. Same seven and a half hours.

Only now I know that three hours and twenty minutes of it went to code review, that seventy-four percent of the week went to work that repeats, and that the thing I was most proud of got fifty minutes.

Nothing about my week changed. What changed is that I could finally see it. That is the whole difference between a timer and a measurement — and it is the difference between talking about deep work and knowing whether you did any.

Everyone talks about deep work. Almost nobody measures it. It turns out measuring it is not a dashboard problem. It is a "group the hours by what they paid for, then say it in one sentence" problem.

That sentence is now the first thing I read in the morning.

---

**Try it:** [app.deepwork.rajatmalik.dev](https://app.deepwork.rajatmalik.dev) — in a tab, on your phone, or installed on your desktop. No account, no sign-in, no email field.

**One question, if you have a second:** if your hours were grouped by what they actually paid for, which line would surprise you most? I read every comment, and the answers to that one have shaped the last two releases.
