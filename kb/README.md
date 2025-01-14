# LLM-Maintained Obsidian Wiki (Scaffold)

This folder is a minimal loop for an LLM-managed knowledge base that plays nicely with Obsidian.

## Layout
- `raw/` sources clipped from the web or dropped manually.
- `wiki/` compiled articles, queries, and outputs.
- `assets/` downloaded images or attachments you reference from notes.
- `_index/` auto-generated TOC.
- `reports/` lint/health reports.
- `scratch/` transient prompts/results.

## Quickstart
1) Install deps (optional features degrade gracefully):
   - `pip install openai markdownify`
2) Create the layout (idempotent):
   - `python kb/cli.py init`
3) Ingest files you clipped/exported:
   - `python kb/cli.py ingest /path/to/file1.md /path/to/page.html --tags research notes`
4) Compile the raw notes into `wiki/` (uses LLM if you supply `--model`):
   - `OPENAI_API_KEY=... python kb/cli.py compile --model gpt-4o`
   - omit `--model` for offline summaries (truncates to first ~40 lines).
5) Ask a question against the wiki (top-k naive rank + optional LLM answer):
   - `python kb/cli.py ask "How does paper X relate to method Y?" --model gpt-4o`
6) Lint wikilinks:
   - `python kb/cli.py lint`

## Notes
- Ingest preserves a small JSON header with source path, created time, and tags.
- Compile writes summaries, key points, and backlink suggestions per note and refreshes `_index/toc.md`.
- Ask saves responses under `wiki/queries-*.md` so your questions become part of the corpus.
- If `markdownify` is installed, HTML is converted to Markdown; otherwise a simple tag strip is used.
- For local models, swap `--model gpt-4o` with your runner (e.g., `--model local:ollama`).
