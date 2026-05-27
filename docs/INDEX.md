# Documentation & Configuration Index

Central reference for all guidance files in this repository.

## Human-facing docs (`docs/`)

| File | Purpose |
|------|---------|
| [angular-best-practices.md](angular-best-practices.md) | Angular/TypeScript coding standards |

## Copilot / AI agent configuration

| File / Folder | Purpose |
|---------------|---------|
| `.github/copilot-instructions.md` | Global instructions loaded into every Copilot chat |
| `.agents/skills/angular-developer/SKILL.md` | Angular skill auto-loaded when Copilot generates code |
| `.github/agents/*.agent.md` | Spec Kit agent definitions (plan, implement, etc.) |
| `.github/prompts/*.prompt.md` | Spec Kit prompt templates |

## Specs & Plans (`specs/`)

| Folder | Purpose |
|--------|---------|
| `specs/001-create-deepwork/` | Feature spec, plan, and tasks for initial build |

---

> **Rule of thumb:**  
> - Put human docs in `docs/`.  
> - Put Copilot agent/skill files in `.agents/` or `.github/`.  
> - Keep `specs/` for feature specifications managed by Spec Kit.
