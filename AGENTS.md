# AGENTS.md

Instructions for coding agents working on FOIL. `README.md` describes the product, development and release commands.

## Premise

FOIL is under active development (pre-1.0). **Do not keep backward compatibility or write data migrations.** Remove old formats, old APIs and compatibility branches instead of carrying them, and always rewrite toward the ideal, simplest (KISS) code. When saved settings (`localStorage`) or stored images (IndexedDB) no longer match the current shape, discard them and start from defaults instead of migrating.

## Development cycle

Work in this order for every change:

1. **Update the documents first.** Change the documents that describe the behavior you are about to change (`README.md`, this file, any notes) before touching code, and make sure nothing in them is contradictory or out of date.
2. **Write the tests first (TDD).** Express the expected behavior as a failing test, then implement.
3. **Implement the minimum.** Write only what the tests need. No speculative generalization, options or abstractions.
4. **Do a final check.** Look for code, tests and documents that are no longer used, and for places where the documents and the code disagree. Delete or fix them, and note what you checked in the pull request.
