# Architecture Decision Records

Short, write-once-then-mostly-read docs explaining **why** something is the way it is. Accepted ADRs are stable; if we change an approach, we write a new one that supersedes the old.

Format: number, short title, status, date, context / decision / consequences / future work. Borrowed from Michael Nygard's original write-up.

| # | Title | Status |
|---|-------|--------|
| [0001](./0001-pure-model-layer.md) | Pure model layer for all game math | Accepted |
| [0002](./0002-declarative-event-effects.md) | Declarative effect system for events | Accepted |
| [0003](./0003-save-schema.md) | Save schema + forward-compatible back-fill | Accepted |

When adding a new ADR: copy the next number, fill the four sections, update this index.
