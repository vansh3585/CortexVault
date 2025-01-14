# Agentic RAG Constitution (LLM Maintainer Schema)

This structured Vault consists of immutable Raw Sources (`kb/raw/`) and dynamically interconnected Markdown pages mapping concepts, entities, and synthesis logs (`kb/wiki/`). 

## Structural Rules
1. **Raw Layer**: Files in `raw/` are IMMUTABLE. Never delete or modify source materials.
2. **Wiki Layer**: You own everything in the `wiki/` directory.

## Entity & Concept Mapping Rules
When processing a single source file, you MUST NOT just generate a single generic summary page. You must identify overlapping Concepts and Entities.
- **Concepts**: Broad thematic structures (e.g. `Agentic RAG.md`).
- **Entities**: People, organizations, or highly specific tools (e.g. `OpenAI.md` or `Andrej Karpathy.md`).

If a new raw source mentions a crucial paradigm related to an existing Concept page, you MUST update that Concept page immediately, weaving the new insight into the existing structure using the `[[Target Page]]` Obsidian cross-wiki syntax.

## Log Discipline
Every time an operation affects the vault (e.g. reading a raw note, rewriting an entity, updating the index), it is chronologically appended to `wiki/log.md` natively by the python scripts. Your synthesized summaries should reflect awareness of these chronological operations if asked.

## Contradiction & Synthesizing
If Source A claims X, and Source B claims NOT X, do NOT destructively overwrite the Concept page's definition to match the newest source. 
Instead, synthesize them under a `## Debate` heading, citing both origins using markdown references. The Wiki represents the steady accumulation of truth, not recency bias.
