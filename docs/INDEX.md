# Documentation & Configuration Index

Central reference for all guidance files in this repository.

## Human-facing docs (`docs/`)

| File                                                   | Purpose                             |
| ------------------------------------------------------ | ----------------------------------- |
| [angular-best-practices.md](angular-best-practices.md) | Angular/TypeScript coding standards |

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
| `specs/007-about-and-updates/`           | The About page (developer, contact) and the GitHub release update check              |
| `specs/008-visual-crispness/`            | Whole-pixel type, blur-free shapes, and the mini widget's rounded card                |

---

> **Rule of thumb:**
>
> - Put human docs in `docs/`.
> - Put Copilot agent/skill files in `.agents/` or `.github/`.
> - Keep `specs/` for feature specifications managed by Spec Kit.
