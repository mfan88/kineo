---
name: next-step
description: Do the next unchecked task in docs/tasks.md completely, run all checks, tick it off and summarise. Use when asked for "next", "next step" or "next task".
---

# Next step

Work on exactly one task from `docs/tasks.md`.

1. **Pick the task.** If a task was named in the request, use that one. Otherwise use the first unchecked task (`- [ ]`) from the top of `docs/tasks.md`.
2. **Read before writing.** Re-read `CLAUDE.md`, and the parts of `docs/design-brief.md` and `docs/tech-stack.md` that apply. Re-read every file you are about to change, right before changing it; I may have edited it.
3. **Check scope.** If the task is unclear, needs a new dependency, a schema change, or a decision not covered by the docs, stop and ask before writing code.
4. **Do the whole task.** No stubs, no TODOs, no placeholder data or functions. Stay inside the task: don't touch unrelated files.
5. **Test it.** Business logic gets Vitest tests covering normal cases and edge cases (zero, empty, rounding, locked states).
6. **Run the checks.** Run `pnpm check` from the repo root. Fix every failure your change caused. Never weaken a test or a type to make it pass.
7. **Update the list.** Tick the task in `docs/tasks.md`. Add any follow-ups you noticed under **Discovered**.
8. **Report back** in this format, then stop:
   - **Done:** one sentence on what now works
   - **Files:** list of files changed or added
   - **Checks:** result of `pnpm check`
   - **Notes:** anything I should know or decide (or "None")
   - **Commit message:** a one-line suggestion

Never commit, push or change branches. Leave all changes uncommitted for review.
