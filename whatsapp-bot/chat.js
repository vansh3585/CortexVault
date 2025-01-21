const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs');

const execPromise = util.promisify(exec);

async function handleChatQuery(query) {
    try {
        const kbDir = path.join(__dirname, '..', 'kb');
        // Clean query to prevent shell injection escapes causing issues
        const safeQuery = query.replace(/(["'$`\\])/g, '\\$1');
        
        console.log(`[Backend] Running Ask Query: ${safeQuery}`);
        
        await execPromise(`python3 cli.py ask "${safeQuery}" --model gpt-4o`, { cwd: kbDir });
        
        // The script outputs the result to wiki/synthesis/synthesis-<timestamp>.md
        const synthDir = path.join(kbDir, 'wiki', 'synthesis');
        if (!fs.existsSync(synthDir)) return "Synthesis directory not found. Have you ingested data yet?";
        
        const files = fs.readdirSync(synthDir)
                        .filter(f => f.startsWith('synthesis-'))
                        .map(f => ({ name: f, time: fs.statSync(path.join(synthDir, f)).mtime.getTime() }))
                        .sort((a, b) => b.time - a.time);
                        
        if (files.length > 0) {
            return fs.readFileSync(path.join(synthDir, files[0].name), 'utf-8');
        }
        
        return "Python engine provided empty output.";
    } catch (err) {
        console.error("Chat Query Error:", err);
        return "⚠️ Failed to reach Python AI backend.";
    }
}

module.exports = { handleChatQuery };
