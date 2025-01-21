require('dotenv').config();
const { ingestUrl } = require('./ingest');
const { execSync } = require('child_process');
const path = require('path');
const OpenAI = require('openai');

async function runAutoresearch() {
    console.log("🚀 Starting Autonomous Curation Loop...");
    try {
        // Fetch ArXiv CS.CV (Computer Vision) latest papers via standard RSS
        const res = await fetch('http://export.arxiv.org/rss/cs.CV');
        const xml = await res.text();
        
        // Naive but effective XML parser for <item> blocks
        const itemsList = xml.split('<item>').slice(1);
        
        const openai = new OpenAI();
        let ingestedCount = 0;
        
        const evalCount = Math.min(itemsList.length, 20);
        console.log(`Found ${itemsList.length} recent papers on arXiv... Trial Run: Subjecting precisely ${evalCount} to deep Reasoning Scoring Rubric...`);
        
        for (const itemBlock of itemsList.slice(0, evalCount)) {
            const titleMatch = itemBlock.match(/<title>([\s\S]*?)<\/title>/);
            const linkMatch = itemBlock.match(/<link>([\s\S]*?)<\/link>/);
            const descMatch = itemBlock.match(/<description>([\s\S]*?)<\/description>/);
            
            if (!titleMatch || !linkMatch) continue;
            
            const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
            let link = linkMatch[1].trim();
            const abstract = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';
            
            // Smart router: Fetch the full HTML paper payload instead of the Abstract summary page
            if (link.includes('arxiv.org/abs/')) {
                link = link.replace('arxiv.org/abs/', 'arxiv.org/html/');
            }
            
            console.log(`\nEvaluating: ${title}`);
            
            const prompt = `You are an elite AI researcher evaluating papers for inclusion in an autonomous Knowledge Base.
We strictly only want papers that make breakthroughs in: Agentic workflows, Information Retrieval (RAG), Autonomous Orchestrators, or Model Memory.

Evaluate the following paper on three axes from 1 to 10:
1. Alignment: Does it precisely match the topics above?
2. Novelty: Is it a true paradigm shift, or just an incremental patch?
3. Impact: Does it solve a massive bottleneck in the field?

Output your reasoning chain, and then end your response with a strict JSON object mapping these numeric scores:
\`\`\`json
{
  "alignment": 8,
  "novelty": 7,
  "impact": 7,
  "total": 22
}
\`\`\`

Title: ${title}
Abstract: ${abstract}
`;

            try {
                // Using o3-mini for extreme reasoning depth at low cost. If your API tier does not support it, simply swap back to "gpt-4o"
                const evalRes = await openai.chat.completions.create({
                    model: "o3-mini",
                    messages: [{ role: "user", content: prompt }]
                });
                
                const responseText = evalRes.choices[0].message.content;
                // Safely extract the JSON object regardless of markdown formatting
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                
                if (jsonMatch) {
                    const rubric = JSON.parse(jsonMatch[0]);
                    console.log(`=> Score: Alignment(${rubric.alignment}), Novelty(${rubric.novelty}), Impact(${rubric.impact}) | Total: ${rubric.total}/30`);
                    
                    if (rubric.total >= 24) {
                        console.log(`✨ Exceptionally High Signal! Auto-ingesting: ${link}`);
                        await ingestUrl(link);
                        ingestedCount++;
                    } else {
                        console.log(`❌ Skipped (Total score ${rubric.total} < 24)`);
                    }
                } else {
                    console.log(`⚠️ Skipped: Failed to parse JSON rubric from response.`);
                }
            } catch (err) {
                 console.log(`⚠️ API Error evaluating paper: ${err.message}`);
                 if (err.message.includes('model')) {
                     console.log("-> Please ensure your OpenAI tier has access to o3-mini API, or change line 52 to 'gpt-4o'.");
                     break; 
                 }
            }
        }
        
        if (ingestedCount > 0) {
            console.log(`\n[Backend] Invoking python compiler over ${ingestedCount} new items...`);
            const kbDir = path.join(__dirname, '..', 'kb');
            execSync(`python3 cli.py compile --model gpt-4o`, { cwd: kbDir, stdio: 'inherit' });
            console.log(`✅ Autoresearch Cycle Complete. Knowledge Base Updated!`);
        } else {
            console.log(`\n✅ Autoresearch Cycle Complete. No new actions taken.`);
        }
        
    } catch (e) {
        console.error("Autoresearch Loop crashed:", e);
    }
}

runAutoresearch();
