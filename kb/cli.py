#!/usr/bin/env python3
"""
Lightweight CLI for an Obsidian-friendly, LLM-maintained knowledge base.

Layout (created on init):
  kb/raw/       captured sources (markdown/html/txt)
  kb/wiki/      compiled articles and queries
  kb/assets/    downloaded images or attachments
  kb/_index/    auto-maintained index files
  kb/reports/   lint/health reports
  kb/scratch/   transient prompts/results
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import ssl
import tempfile
import urllib.request
import urllib.parse
import shutil
import sys
from collections import Counter
from pathlib import Path
from typing import Iterable, List, Tuple

# Optional deps
try:
    import openai  # type: ignore
except ImportError:  # pragma: no cover - optional
    openai = None

try:
    from markdownify import markdownify as md_to_markdown  # type: ignore
except ImportError:  # pragma: no cover - optional
    md_to_markdown = None

ROOT = Path(__file__).resolve().parent
RAW_DIR = ROOT / "raw"
WIKI_DIR = ROOT / "wiki"
INDEX_DIR = ROOT / "_index"
REPORTS_DIR = ROOT / "reports"


def timestamp() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def log_operation(operation: str, description: str) -> None:
    log_path = WIKI_DIR / "log.md"
    ts = timestamp()
    entry = f"## [{ts}] {operation.upper()} | {description}\n"
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(entry)


def slugify(name: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9_-]+", "-", name.strip().lower()).strip("-")
    return base or "note"


def ensure_layout() -> None:
    for p in [RAW_DIR, WIKI_DIR, INDEX_DIR, REPORTS_DIR, ROOT / "assets", ROOT / "scratch"]:
        p.mkdir(parents=True, exist_ok=True)


def convert_to_markdown(path: Path) -> Tuple[str, str]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    suffix = path.suffix.lower()
    if suffix in {".md", ".markdown"}:
        return text, "text/markdown"
    if suffix in {".html", ".htm"} and md_to_markdown:
        return md_to_markdown(text), "text/html"
    if suffix in {".html", ".htm"}:
        # Minimal fallback: strip tags crudely
        cleaned = re.sub(r"<(script|style)[^>]*>.*?</\\1>", "", text, flags=re.S)
        cleaned = re.sub(r"<[^>]+>", "", cleaned)
        return cleaned, "text/html"
    return text, "text/plain"


def write_raw(source: Path, title: str | None, tags: List[str]) -> Path:
    body, mime = convert_to_markdown(source)
    meta = {
        "title": title or source.stem,
        "source_path": str(source),
        "created_at": timestamp(),
        "tags": tags,
        "mime": mime,
    }
    dest = RAW_DIR / f"{slugify(meta['title'])}-{int(dt.datetime.now().timestamp())}.md"
    header = ["---", json.dumps(meta, ensure_ascii=False, indent=2), "---", ""]
    dest.write_text("\n".join(header) + body, encoding="utf-8")
    return dest


def list_markdown_files(folder: Path) -> List[Path]:
    return sorted([p for p in folder.glob("**/*.md") if p.is_file()])

def cosine_similarity(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5
    if norm_a == 0 or norm_b == 0: return 0.0
    return dot / (norm_a * norm_b)

def get_embedding(text: str) -> List[float]:
    if openai is None: return []
    client = openai.OpenAI()
    # OpenAI embedding input max is ~8192 tokens. Slice string to be safe.
    resp = client.embeddings.create(input=[text[:25000]], model="text-embedding-3-small")
    return resp.data[0].embedding


def call_llm(prompt: str, model: str, temperature: float = 0.2) -> str:
    if openai is None:
        raise RuntimeError("openai package not installed. pip install openai")
    from openai import OpenAI

    client = OpenAI()
    kwargs = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You are a concise research assistant. Use markdown, cite file names.",
            },
            {"role": "user", "content": prompt},
        ],
    }
    
    # Reasoning models (like o3-mini) do not accept the temperature parameter natively
    if "o3" not in model and "o1" not in model:
        kwargs["temperature"] = temperature
        
    response = client.chat.completions.create(**kwargs)
    return response.choices[0].message.content or ""


def compile_one(raw_file: Path, model: str | None, overwrite: bool) -> Path:
    content = raw_file.read_text(encoding="utf-8")
    meta_match = re.match(r"---\n(.*?)\n---\n", content, flags=re.S)
    meta = {}
    if meta_match:
        meta = json.loads(meta_match.group(1))
        body = content[meta_match.end() :]
    else:
        body = content
    title = meta.get("title") or raw_file.stem
    wiki_path = WIKI_DIR / f"{slugify(title)}.md"
    if wiki_path.exists() and not overwrite:
        return wiki_path

    summary = ""
    if model:
        agents_path = ROOT / "AGENTS.md"
        constitution = agents_path.read_text("utf-8") if agents_path.exists() else "Be a helpful wiki agent."
        
        prompt = (
            f"You are a Compounding Wiki Architect. Read this raw source text.\n"
            f"Your Constitution:\n{constitution}\n\n"
            f"# Source: {title}\n\n{body[:25000]}\n\n"
            f"Tasks:\n"
            f"1. Summarize the source perfectly.\n"
            f"2. Identify up to 3 core Concepts or Entities this source discusses.\n"
            f"3. For each concept, write a short standalone paragraph integrating the new insights from this source, using Markdown. We will autonomously inject this natively into the Concept's dedicated file page.\n"
            f"Output your response strictly as a JSON object:\n"
            f"{{\n"
            f"  \"summary_md\": \"Summary here...\",\n"
            f"  \"concepts\": [\n"
            f"    {{\"concept_name\": \"Concept Name\", \"injection_md\": \"Insight paragraph...\"}}\n"
            f"  ]\n"
            f"}}"
        )
        try:
            raw_reply = call_llm(prompt, model)
            match = re.search(r'\{[\s\S]*\}', raw_reply)
            if match:
                data = json.loads(match.group(0))
                summary = data.get("summary_md", "")
                
                concepts_dir = WIKI_DIR / "concepts"
                concepts_dir.mkdir(exist_ok=True)
                
                for c in data.get("concepts", []):
                    c_name = c.get("concept_name", "Unknown")
                    c_inj = c.get("injection_md", "")
                    c_path = concepts_dir / f"{slugify(c_name)}.md"
                    
                    injection = f"\n\n## Insights from [[{slugify(title)}]]\n_{timestamp()}_\n{c_inj}\n"
                    if c_path.exists():
                        with open(c_path, "a", encoding="utf-8") as f:
                            f.write(injection)
                    else:
                        c_path.write_text(f"# Concept: {c_name}\n{injection}", encoding="utf-8")
                        
            else:
                summary = "Failed to parse JSON compilation structure. Raw:\n" + raw_reply
        except Exception as exc:  # pragma: no cover
            summary = f"LLM call failed: {exc}"
    else:
        head = body.splitlines()[:40]
        summary = "Summary (offline fallback):\n" + "\n".join(head)

    new_body = "\n".join(
        [
            f"# {title}",
            "",
            f"_Compiled: {timestamp()} from raw/{raw_file.name}_",
            "",
            summary.strip(),
            "",
            "## Source",
            f"- File: raw/{raw_file.name}",
            f"- Tags: {', '.join(meta.get('tags', []))}",
        ]
    )
    wiki_path.write_text(new_body, encoding="utf-8")
    return wiki_path


def update_toc() -> Path:
    entries = []
    for path in list_markdown_files(WIKI_DIR):
        rel = path.relative_to(ROOT)
        mtime = dt.datetime.fromtimestamp(path.stat().st_mtime, tz=dt.timezone.utc)
        entries.append((rel.as_posix(), mtime.isoformat(timespec="seconds")))
    toc = ["# Wiki Index", f"_Updated {timestamp()}_"]
    for rel, ts in sorted(entries):
        toc.append(f"- {rel} (updated {ts})")
    out = INDEX_DIR / "toc.md"
    out.write_text("\n".join(toc) + "\n", encoding="utf-8")
    return out


def lint_links(model: str = "o3-mini") -> Path:
    missing = []
    wiki_files = list_markdown_files(WIKI_DIR)
    names = {p.stem for p in wiki_files}
    
    link_pat = re.compile(r"\[\[([^\]]+)\]\]")
    file_contents = {}
    
    for path in wiki_files:
        text = path.read_text(encoding="utf-8", errors="ignore")
        file_contents[path] = text
        for link in link_pat.findall(text):
            target = slugify(link)
            if target not in names:
                missing.append((path, link))
                
    lines = ["# Agentic Wiki Health Report", f"_Run at {timestamp()}_", ""]
    
    if not missing:
        lines.append("## Link Integrity\nAll existing `[[wikilinks]]` safely resolve to existing concepts.\n")
    else:
        # Ask LLM to heal the broken links by mapping them to existing pages
        available_pages = list(names)
        prompt = (
            f"You are the Wiki Healer. The vault has the following valid pages:\n{available_pages}\n\n"
            f"The following links are broken and point to non-existent pages:\n"
            f"{[link for _, link in missing]}\n\n"
            f"Output a JSON mapping of broken links to their closest existing page string. If no page is close conceptually, map it to null.\n"
            f"Example: {{\"broken_link_str\": \"closest_existing_page\"}}"
        )
        try:
            raw_reply = call_llm(prompt, model)
            match = re.search(r'\{[\s\S]*\}', raw_reply)
            if match:
                healing_map = json.loads(match.group(0))
                healed_count = 0
                for path, text in file_contents.items():
                    new_text = text
                    for broken, fixed in healing_map.items():
                        if fixed and fixed in names:
                            # Replace internal broken link with fixed link
                            new_text = new_text.replace(f"[[{broken}]]", f"[[{fixed}]]")
                            healed_count += 1
                    if new_text != text:
                        path.write_text(new_text, encoding="utf-8")
                lines.append(f"## Link Integrity\nFound {len(missing)} broken anomalies. LLM Auto-Healer successfully re-routed {healed_count} broken links to valid concepts.\n")
            else:
                lines.append("## Link Integrity\nBroken links found, but LLM healing failed to parse JSON.\n")
        except Exception as e:
            lines.append(f"## Link Integrity\nBroken links found, but LLM healing raised error: {e}\n")
            
    # Topological Gap Analysis
    toc_path = INDEX_DIR / "toc.md"
    if toc_path.exists():
        survey_prompt = (
            f"You are the Wiki Healer. Here is the table of contents of the entire research vault:\n{toc_path.read_text('utf-8')[:25000]}\n\n"
            f"Identify 3 major 'Orphan Concepts' or 'Knowledge Gaps' that the user should research next to connect the disjointed knowledge into a cohesive whole. Output as Markdown bullet points."
        )
        try:
            gap_analysis = call_llm(survey_prompt, model)
            lines.append("## Knowledge Gaps & Autoresearch Targets\n" + gap_analysis)
        except Exception as e:
            lines.append(f"## Knowledge Gaps\nFailed to generate gap analysis: {e}")
            
    report = REPORTS_DIR / f"health-{int(dt.datetime.now().timestamp())}.md"
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    log_operation("lint", f"Ran Agentic Wiki Healer. Saved to {report.name}.")
    return report


def cmd_init(_: argparse.Namespace) -> None:
    ensure_layout()
    print(f"Initialized KB under {ROOT}")


def cmd_ingest(args: argparse.Namespace) -> None:
    ensure_layout()
    tags = args.tags or []
    added = []
    for src in args.sources:
        if src.startswith("http://") or src.startswith("https://"):
            try:
                print(f"Fetching {src}...")
                req = urllib.request.Request(src, headers={'User-Agent': 'Mozilla/5.0'})
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                html = urllib.request.urlopen(req, context=ctx).read().decode('utf-8', errors='ignore')
                
                fd, tmp_path_str = tempfile.mkstemp(suffix=".html")
                with os.fdopen(fd, 'w', encoding='utf-8') as f:
                    f.write(html)
                    
                tmp_path = Path(tmp_path_str)
                parsed = urllib.parse.urlparse(src)
                default_title = args.title or (parsed.netloc + parsed.path.replace('/', '-')).strip('-') or "web-clip"
                
                dest = write_raw(tmp_path, default_title, tags)
                added.append(dest)
                tmp_path.unlink()
            except Exception as e:
                print(f"Failed to fetch {src}: {e}", file=sys.stderr)
        else:
            src_path = Path(src).expanduser().resolve()
            if not src_path.exists():
                print(f"Skip missing: {src_path}", file=sys.stderr)
                continue
            dest = write_raw(src_path, args.title, tags)
            added.append(dest)
    print(f"Ingested {len(added)} file(s) into raw/")


def cmd_compile(args: argparse.Namespace) -> None:
    ensure_layout()
    model = args.model
    raw_files = list_markdown_files(RAW_DIR)
    touched = []
    
    embeddings = {}
    emb_path = INDEX_DIR / "embeddings.json"
    if emb_path.exists():
        try:
            embeddings = json.loads(emb_path.read_text("utf-8"))
        except:
            pass

    for raw_file in raw_files:
        out = compile_one(raw_file, model=model, overwrite=args.overwrite)
        touched.append(out)
        log_operation("compile", f"Processed raw source '{raw_file.name}' into wiki hierarchy.")
        
        # update semantic embeddings index
        key = out.name
        if key not in embeddings or args.overwrite:
            wiki_text = out.read_text("utf-8", errors="ignore")
            emb = get_embedding(wiki_text)
            if emb: embeddings[key] = emb

    if embeddings:
        emb_path.write_text(json.dumps(embeddings), "utf-8")

    toc = update_toc()
    print(f"Compiled {len(touched)} note(s). Updated semantic index at {toc}")


def cmd_ask(args: argparse.Namespace) -> None:
    ensure_layout()
    wiki_files = list_markdown_files(WIKI_DIR)
    
    emb_path = INDEX_DIR / "embeddings.json"
    if not emb_path.exists():
        print("No embeddings found! Run `python3 cli.py compile` first to generate semantic index.")
        return
        
    try:
        embeddings = json.loads(emb_path.read_text("utf-8"))
    except:
        embeddings = {}
        
    query_emb = get_embedding(args.query)
    if not query_emb:
        print("Failed to embed query. Is OpenAI API key set?")
        return

    scores = []
    for path in wiki_files:
        if path.name in embeddings:
            score = cosine_similarity(query_emb, embeddings[path.name])
            scores.append((path, score))
            
    ranked = sorted(scores, key=lambda x: x[1], reverse=True)[:args.k]
    
    context = []
    for path, score in ranked:
        # Require a positive similarity baseline to inject context
        if score < 0.15: continue
        context.append(f"# {path.stem} (Similarity: {score:.2f})\n{path.read_text(encoding='utf-8', errors='ignore')[:2000]}")
        
    if not context:
        print("No conceptually relevant docs found with high confidence in the vector space.")
        return
    prompt = f"Answer the query using the context below. Cite file names.\n\nQuery: {args.query}\n\nContext:\n" + "\n\n".join(context)
    if args.model:
        try:
            reply = call_llm(prompt, args.model, temperature=args.temperature)
            print(f"Got reply of length {len(reply)}")
        except Exception as exc:  # pragma: no cover
            reply = f"LLM call failed: {exc}"
    else:
        reply = "LLM disabled; showing top contexts only.\n\n" + "\n\n".join(context)
        
    synth_dir = WIKI_DIR / "synthesis"
    synth_dir.mkdir(exist_ok=True)
    out = synth_dir / f"synthesis-{int(dt.datetime.now().timestamp())}.md"
    
    out.write_text(reply, encoding="utf-8")
    log_operation("query", f"Synthesized answer to query: '{args.query}'. Output saved to '{out.name}'.")
    print(f"Saved answer to {out.relative_to(ROOT)}")


def cmd_lint(args: argparse.Namespace) -> None:
    ensure_layout()
    report = lint_links(getattr(args, "model", None) or "o3-mini")
    print(f"Wrote Agentic Health report to {report.relative_to(ROOT)}")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="LLM-maintained personal wiki helper.")
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("init", help="Create folder layout.")
    sp.set_defaults(func=cmd_init)

    sp = sub.add_parser("ingest", help="Ingest source files into raw/.")
    sp.add_argument("sources", nargs="+", help="Paths to files to ingest.")
    sp.add_argument("--title", help="Override title for single source.")
    sp.add_argument("--tags", nargs="*", help="Tags to add.")
    sp.set_defaults(func=cmd_ingest)

    sp = sub.add_parser("compile", help="Summarize raw/ into wiki/.")
    sp.add_argument("--model", help="LLM model id (e.g. gpt-4o, gpt-3.5-turbo, local:ollama). If omitted, uses offline fallback.")
    sp.add_argument("--overwrite", action="store_true", help="Rebuild wiki files even if they exist.")
    sp.set_defaults(func=cmd_compile)

    sp = sub.add_parser("ask", help="Query the wiki.")
    sp.add_argument("query", help="Question to answer.")
    sp.add_argument("-k", type=int, default=5, help="Top-k docs to consider.")
    sp.add_argument("--model", help="LLM model id for answering.")
    sp.add_argument("--temperature", type=float, default=0.2, help="LLM temperature.")
    sp.set_defaults(func=cmd_ask)

    sp = sub.add_parser("lint", help="Check for broken wikilinks and generate AI health reports.")
    sp.add_argument("--model", help="LLM model id (e.g. gpt-4o, o3-mini).")
    sp.set_defaults(func=cmd_lint)

    return p


def main(argv: Iterable[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    args.func(args)


if __name__ == "__main__":  # pragma: no cover
    main()
