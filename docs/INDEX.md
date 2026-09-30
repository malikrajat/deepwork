# Documentation & Configuration Index

Central reference for all guidance files in this repository.

## Human-facing docs (`docs/`)

| File                                                   | Purpose                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| [angular-best-practices.md](angular-best-practices.md) | Angular/TypeScript coding standards                            |
| [code-signing.md](code-signing.md)                     | Signing the Windows installer: what Windows shows, and how to |

## Copilot / AI agent configuration

| File / Folder                               | Purpose                                               |
| ------------------------------------------- | ----------------------------------------------------- |
| `.github/copilot-instructions.md`           | Global instructions loaded into every Copilot chat    |
| `.agents/skills/angular-developer/SKILL.md` | Angular skill auto-loaded when Copilot generates code |
| `.github/agents/*.agent.md`                 | Spec Kit agent definitions (plan, implement, etc.)    |
| `.github/prompts/*.prompt.md`               | Spec Kit prompt templates                             |

## Specs & Plans (`specs/`)

| Folder                                   | Purpose                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `specs/001-create-deepwork/`             | Feature spec, plan, and tasks for initial build                                      |
| `specs/002-desktop-preferences/`         | Start with system, always on top, and the mini widget                                |
| `specs/003-mini-widget-window/`          | Minimising the window into the mini widget, the countdown ring, and the login launch |
| `specs/004-downloads-and-task-defaults/` | Downloads that report their file location, and today's date in the add-task form     |
| `specs/005-task-status-board/`           | The Jira-style status board shared by the Tasks and Today pages                      |
| `specs/006-diagnostics-and-ci/`          | The five log files, the "Open log folder" button, and the CI pipeline                |
| `specs/007-about-and-updates/`           | The About page, the release update check, and installing an update                   |
| `specs/008-visual-crispness/`            | Whole-pixel type, blur-free shapes, and the mini widget's rounded card               |
| `specs/009-water-reminders/`             | The water reminder, and today's water tally on the dashboard                         |
| `specs/010-water-nudge/`                 | The reminder as a card that asks Yes/No, and the wider glass and cadence choices     |
| `specs/011-completion-alert/`            | The finished-session alert, answered from the mini widget, and its repeat: the tagged OS notification, the shake and the colour walk |
| `specs/012-task-dates-and-today/`        | The task's own date deciding the day it belongs to: imports for tomorrow, and today |

---

> **Rule of thumb:**
>
> - Put human docs in `docs/`.
> - Put Copilot agent/skill files in `.agents/` or `.github/`.
> - Keep `specs/` for feature specifications managed by Spec Kit.
