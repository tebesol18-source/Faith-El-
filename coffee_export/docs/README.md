# Coffee Export — Documentation

This folder contains all project documentation. Each subfolder covers a
specific area:

| Folder | Contents |
|--------|----------|
| [`architecture/`](architecture/) | System architecture, data flow, design decisions |
| [`agents/`](agents/) | Agent responsibilities, prompts, handoff protocols |
| [`schema/`](schema/) | Database schema, ER diagrams, migration history |
| [`api/`](api/) | Internal API docs (StateManager, EventBus, TaskQueue) |
| [`development/`](development/) | Dev setup, contributing guide, troubleshooting |

## Quick Links

- [Architecture Overview](architecture/overview.md)
- [Agent Responsibilities](agents/responsibilities.md)
- [Database Schema](schema/schema.md)
- [State Manager API](api/state_manager.md)
- [Development Setup](development/setup.md)

## Documentation Principles

1. **Write docs as code** — every doc is a Markdown file in git, versioned
   alongside the code it describes.
2. **Keep docs close to truth** — when code changes, update the doc in the
   same commit. Stale docs are worse than no docs.
3. **Diagrams in Mermaid** — renders in GitHub, easy to maintain, no binary
   files in git.
4. **One concept per file** — don't create a single 5000-word README. Split
   by topic.
