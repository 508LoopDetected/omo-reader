# TODO

## Consolidate Reader Components

The reader UI is implemented twice — once in the GUI (`packages/gui/src/lib/components/reader/`) and once as a standalone SPA (`packages/core/reader/`). The TUI launches the standalone SPA in a browser. These are near-identical Svelte components that were copy-pasted rather than shared. Any reader feature or bugfix currently needs to be applied in both places.

Consolidate into a single shared implementation.
