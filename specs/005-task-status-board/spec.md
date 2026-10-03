# Feature Specification: A Jira-style status board for Tasks and Today

**Feature branch**: `version3.0`
**Status**: Implemented
**Created**: 2026-09-18

## Summary

Tasks and Today listed tasks as one flat, checkbox-driven list. The checkbox only
walked To Do → In Progress → Done and said nothing about where the work sat, so the
listing is replaced by the thing people already know from Jira: a board with one
column per status, where a card is dragged into the column it belongs to.

Everything else the task list did — search, sort, add, edit, delete, the Today star,
priority, deadline, quadrant, repeat — stays.

## User Scenarios & Testing

### Primary stories

1. **Move work along.** The user drags a card from *To Do* into *In Progress*; the
   card lands in that column, is stamped with the new status colour and keeps its
   place until it is dragged again.
2. **Work the day.** On Today the same board holds the day's list, so the columns
   *are* the plan; the card's position inside a column is the order the user wants
   to work in, and it survives a reload.
3. **See status at a glance.** A card's colour follows its status everywhere: grey
   in *To Do*, amber in *In Progress*, violet in *Done* — the same three colours
   on Tasks, on Today and while the card is in the air mid-drag.
4. **Find a task.** Search narrows the board; the columns are the status filter, so
   nothing is hidden behind a pill.
5. **No mouse.** With a card focused, `1` `2` `3` jump it to a status and the arrow
   keys walk it along the board; `Enter` opens the task on the Tasks page.

### Acceptance criteria

- **AC-1** The Tasks and Today pages both render one column per status — To Do, In
  Progress, Done — from the same board component.
- **AC-2** Dragging a card into another column writes that status and the card
  appears in that column; a drop inside its own column changes nothing on Tasks
  (the list is sorted) and re-orders the day on Today.
- **AC-3** The status checkbox is gone from both pages; status is set by dragging,
  by the `1`/`2`/`3` shortcuts, or by the arrow keys.
- **AC-4** The status filter pills (All / To Do / In Progress / Done) are gone from
  the Tasks page; the columns replace them.
- **AC-5** Search, sort, Add, Edit, Delete, Export, Import, the Today star and every
  task property still work on the board.
- **AC-6** Every card carries its status colour from one shared place
  (`STATUS_CONFIG.cardClass` + `src/styles.css`), so a card can never be amber on
  one page and violet on the other, in either theme.
- **AC-7** Today keeps its Done column: completing a card there greys it out and
  strikes the title instead of making it vanish, so it can be dragged back.
- **AC-8** The day's sequence still persists (`todayOrder`), and quadrant priority
  still lifts the day's most important work to the top of a column.

### Out of scope

- Custom or user-created columns: the three statuses are the workflow.
- Multi-select, swimlanes, WIP limits and per-column sorting controls.
