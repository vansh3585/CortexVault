# 🧠 Genic: Your Private AI Research Brain in WhatsApp + Obsidian

**Turn your everyday WhatsApp "Message Yourself" chat into a powerful, always-on second brain.**

Everything you send gets automatically cleaned, summarized, tagged, connected, and saved into your Obsidian vault — no copying, no switching apps, no manual work. Ask natural questions on WhatsApp and get smart answers pulled from all your notes, papers, and ideas instantly.

It’s the simplest, most private way to build and use a personal RAG knowledge base.

---

### 🔴 The Problem
You read 10 articles a day. You bookmark links, save tweets, forward research papers, and jot down random ideas while working toward a goal.

But a few weeks later… **you can’t find anything.**

Your bookmarks are scattered, your notes are messy, and when you actually need that one perfect insight, it’s buried and forgotten. This is the exact problem Andrej Karpathy talked about in his “LLM Knowledge Base” essay — and **Genic fixes it.**

### 🟢 The Solution
Genic turns your everyday WhatsApp “Message Yourself” chat into a smart, private AI research brain that lives inside Obsidian.

Everything you throw at it gets automatically cleaned, summarized, tagged, connected, and stored semantically — so when you need it later, you can just ask in plain English and get the right answer instantly.

No more copy-pasting. No more losing important links. No more disorganized knowledge.

---

### 🏛️ The Core Philosophy

Genic rejects the "black-box RAG" status quo. It draws heavy inspiration from Andrej Karpathy's vision and concepts like *Farzapedia*:

1. **Explicit & Navigable:** The memory is an explicit Wiki in plain text. You can see exactly what the AI does and doesn't know. You can manually inspect and edit what the AI writes.
2. **File Over App:** The memory is just a collection of universal Markdown files on your local computer. Your data isn't trapped in a SaaS database. You can apply the entire Unix toolkit over it, open it in Obsidian, or write your own scripts to crawl it.
3. **Yours ("BYOAI"):** Bring your own AI. You can plug Claude, GPT-4o, or Open Source weights straight into this information. Keep the AI companies on their toes.
4. **It Just Works Better:** Traditional RAG is often frustrating because it just searches isolated text chunks. But a knowledge base that lets an agent actively read, backlink, and rewrite a file system creates a "super genius librarian" that never gets tired.

---

### ⚡ How It Actually Helps (Real Productivity)

* **Save any link, article, PDF, or text chunk in seconds** → it lands perfectly organized in your Obsidian vault.
* **Ask natural questions** like “How do agentic systems work?” or “What did we learn about RAG last month?” → get precise answers drawn from everything you’ve ever saved.
* **Wake up to fresh, high-quality research automatically added to your vault** every day (it scans arXiv and only keeps the best papers).
* **Your knowledge actually connects** — you start seeing relationships between ideas instead of just collecting notes.

---

### 💼 Real use cases

* **Researchers & students:** Ingest 10 papers in 2 minutes instead of spending an hour organizing them.
* **Founders & indie hackers:** Keep every article, tweet thread, and idea perfectly searchable and connected.
* **Knowledge workers:** Turn scattered reading into a single, intelligent brain you can talk to anytime via WhatsApp.

---

### 📱 How to use it (super simple)

Just chat with yourself on WhatsApp:

- `/ingest [link]` → instantly saves and organizes the page into Obsidian
- `/ask [your question]` → gets an intelligent answer from your entire vault
- `/research` → manually triggers the AI to find and add the best new papers
- `/visualize` → creates a beautiful knowledge graph in your vault
- `/heal` → automatically fixes broken links and suggests missing connections

---

### 🚀 Quick Start (takes < 5 minutes)

1. Clone the repo
2. Copy `.env.example` to `.env` and add your OpenAI key
3. Install dependencies (Node + Python)
4. Run `node index.js` → scan the QR code with WhatsApp (Linked Devices)
5. *(Optional)* Open another terminal and run `node autoresearch.js` for fully automatic daily paper ingestion

That’s it. You’re now running your own private AI research brain.

> **🔒 Security note:** The bot only listens to your own “Message Yourself” chat. It completely ignores every other message, group, or person. Your main WhatsApp stays entirely safe and private.

Built for people who read a lot and want their knowledge to actually work for them — without any extra effort.

⭐ **Star the repo if this saves you time!** 🚀  
*Contributions and feedback welcome.*
