const { extractUrls, ingestUrl, ingestRawText } = require('./ingest');
const { handleChatQuery } = require('./chat');

async function handleMessage(client, msg) {
    if (!msg.body) return;
    // (Privacy lockdown and group filtering is now handled strictly inside index.js 
    // using the contact.isMe API before handleMessage is even called)
    // 🛑 CRITICAL FIX: Ignore messages that the bot itself just sent!
    const ignorePrefixes = ['⏳', '✅', '❌', '⚠️', '📚', '=>'];
    if (ignorePrefixes.some(p => msg.body.trim().startsWith(p))) {
        return;
    }
    
    try {
        const text = msg.body.trim();
        const lowerText = text.toLowerCase();
        
        if (lowerText.startsWith('/ingest') || lowerText.startsWith('/add')) {
            const payload = text.replace(/^\/(ingest|add)[\s\n]*/i, '').trim();
            const urls = await extractUrls(payload);
            
            if (urls.length > 0) {
                for (const url of urls) {
                    // Silently ingest without sending long replies to WhatsApp
                    await ingestUrl(url);
                }
            } else {
                // Silently ingest raw text
                await ingestRawText(payload);
            }
            
            // Trigger Python Backend Compilation Over The New Data
            console.log(`[Backend] Invoking python kb/cli.py compile...`);
            const { execSync } = require('child_process');
            const kbDir = require('path').join(__dirname, '..', 'kb');
            try {
                execSync(`python3 cli.py compile --model gpt-4o`, { cwd: kbDir, stdio: 'inherit' });
                console.log(`[Backend] Wiki Compilation Successful!`);
                await msg.reply('✅ Knowledge Base Successfully Updated & Compiled!');
            } catch (e) {
                console.error(`[Backend] Compilation failed:`, e);
                await msg.reply('⚠️ Raw data ingested but compilation encountered an issue.');
            }
            
        } else if (lowerText.startsWith('/research')) {
            console.log(`=> Triggering Autoresearch Loop...`);
            await msg.reply('🕵️‍♀️ Initiating the Agentic arXiv Deep Scan. Evaluating today`s structural pipelines...');
            const { execSync } = require('child_process');
            try {
                execSync(`node autoresearch.js`, { cwd: __dirname, stdio: 'inherit' });
                await msg.reply('✅ Autoresearch Cycle Complete. The active graph has been dynamically compounded with new insights.');
            } catch (e) {
                console.error(e);
                await msg.reply('⚠️ The research script encountered an execution barrier.');
            }
            
        } else if (lowerText.startsWith('/heal') || lowerText.startsWith('/lint')) {
            console.log(`=> Triggering Wiki Healer...`);
            await msg.reply('⚕️ Waking the AI Healer. Auditing the topology of your Obsidian markdown brain...');
            const { execSync } = require('child_process');
            const kbDir = require('path').join(__dirname, '..', 'kb');
            try {
                execSync(`python3 cli.py lint --model o3-mini`, { cwd: kbDir, stdio: 'inherit' });
                await msg.reply('✨ Graph Topology Healed. Check your `kb/reports/` for the intelligent gap analysis!');
            } catch (e) {
                console.error(e);
                await msg.reply('⚠️ Healing sequence encountered a core anomaly.');
            }

        } else if (lowerText.startsWith('/visualize') || lowerText.startsWith('/visualise')) {
            const query = text.replace(/^\/visualiz[se][\s\n]*/i, '').trim();
            console.log(`=> Visual Artifact: "${query}"`);
            await msg.reply('📊 Generating visual artifact...');
            
            const prompt = `Provide a comprehensive Mermaid.js graph visualizing the following concept based on the wiki: ${query}. Output ONLY the raw markdown mermaid block starting with \`\`\`mermaid.`;
            const answer = await handleChatQuery(prompt);
            
            const fs = require('fs');
            const path = require('path');
            const unixTime = Math.floor(Date.now() / 1000);
            const filename = `visualization-${unixTime}.md`;
            const meta = { "title": `Visual: ${query}`, "tags": ["visual-artifact"] };
            const content = `---\n${JSON.stringify(meta, null, 2)}\n---\n# Visualization: ${query}\n\n${answer}`;
            fs.writeFileSync(path.join(__dirname, '..', 'kb', 'raw', filename), content);
            
            const { execSync } = require('child_process');
            execSync(`python3 cli.py compile --model gpt-4o`, { cwd: path.join(__dirname, '..', 'kb'), stdio: 'inherit' });
            
            await msg.reply(`✅ Chart compiled and synced to Obsidian!\n\n${answer}`);

        } else if (lowerText.startsWith('/ask') || lowerText.startsWith('?')) {
            const query = text.replace(/^\/ask[\s\n]*|^\?[\s\n]*/i, '').trim();
            console.log(`=> Treating as chat query: "${query}"`);
            await msg.reply('⏳ Searching Library...');
            const answer = await handleChatQuery(query);
            console.log(`=> Sending answer:`, answer);
            await msg.reply(answer);
        } else {
            // Ignore normal conversational messages that don't have a URL or query prefix
            return;
        }
    } catch (e) {
        console.error('Error handling message:', e);
        await msg.reply('⚠️ An inner error occurred processing your message.');
    }
}

module.exports = { handleMessage };
