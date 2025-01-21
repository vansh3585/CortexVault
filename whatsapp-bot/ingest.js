const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const pdfParse = require('pdf-parse');
const { execSync } = require('child_process');

const DATA_DIR = path.join(__dirname, '..', 'kb', 'raw');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

async function extractUrls(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex) || [];
}

async function ingestUrl(url) {
    let browser;
    try {
        console.log(`[Ingest] Processing link: ${url}...`);
        let title = 'No Title';
        let text = '';
        
        // 📄 PDF DIRECT BYTES
        if (url.toLowerCase().endsWith('.pdf')) {
            console.log(`[Ingest] PDF Detected! Initiating binary extraction...`);
            const response = await axios({
                url: url,
                method: 'GET',
                responseType: 'arraybuffer'
            });
            const pdfData = await pdfParse(response.data);
            title = `PDF Document - ${url.split('/').pop()}`;
            text = pdfData.text.substring(0, 150000); // safety cap
        }
        // 🐙 GITHUB REPOSITORY BUNDLER
        else if (url.includes('github.com/') && !url.includes('/blob/') && url.split('/').length >= 4) {
            console.log(`[Ingest] GitHub Repository Detected! Clustered ingestion via Repomix...`);
            const repoPath = new URL(url).pathname; // e.g. /owner/repo
            const repoName = repoPath.split('/').pop() || 'repo';
            const tmpDir = path.join(__dirname, 'tmp_repo_' + Date.now());
            
            try {
                // Strip git suffix if exists to be safe
                const cleanGitUrl = `https://github.com${repoPath.replace(/\.git$/, '')}.git`;
                execSync(`git clone ${cleanGitUrl} ${tmpDir}`, { stdio: 'ignore' });
                console.log(`[Ingest] Successfully cloned, analyzing entire codebase via repomix...`);
                
                // Run repomix, force output to a specific payload
                execSync(`npx -y repomix@latest --output repomix-output.txt`, { cwd: tmpDir, stdio: 'ignore' });
                
                const repomixOutPath = path.join(tmpDir, 'repomix-output.txt');
                if (fs.existsSync(repomixOutPath)) {
                    text = fs.readFileSync(repomixOutPath, 'utf-8').substring(0, 300000); // prevent insane token overflow (~75k tokens max)
                    title = `Repository - ${repoName}`;
                } else {
                    title = `Repository - ${repoName}`;
                    text = "Failed to bundle repository files.";
                }
            } catch (e) {
                console.error("Repo clone/bundle error:", e);
                title = `Repository - ${repoName}`;
                text = "Failed to clone or analyze this repository.";
            } finally {
                execSync(`rm -rf ${tmpDir}`, { stdio: 'ignore' });
            }
        }
        // 🐦 X.com / TWITTER ANTI-BOT BYPASS
        else if (url.includes('x.com/') || url.includes('twitter.com/')) {
            console.log(`[Ingest] Twitter Link Detected! Fast-bypassing X.com scraper blocks via VxTwitter...`);
            // Strip any query parameters for cleaner API calls (like ?s=46)
            const cleanUrl = url.split('?')[0];
            const vxUrl = cleanUrl.replace(/https?:\/\/(www\.)?(x|twitter)\.com/, 'https://api.vxtwitter.com');
            
            try {
                // Node 18+ has native global fetch()
                const res = await fetch(vxUrl);
                const json = await res.json();
                if (json) {
                    title = `Tweet by ${json.user_name || 'Unknown'}`;
                    text = `Author: ${json.user_name} (@${json.user_screen_name})\n\nContent:\n${json.text || 'No text content.'}`;
                }
            } catch (err) {
                console.error("VxTwitter sync failed:", err);
                text = "Failed to bypass Twitter anti-bot systems.";
            }
        } 
        else {
            // Normal website flow: use Puppeteer
            console.log(`[Ingest] Launching headless browser...`);
            browser = await puppeteer.launch({ 
                headless: "new", 
                args: ['--no-sandbox', '--disable-setuid-sandbox'] 
            });
            const page = await browser.newPage();
            
            // Pretend to be a normal, non-automated chrome browser on a Mac
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
            
            // Use domcontentloaded to make it load instantly without waiting for infinite trackers
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
            
            // Give normal JS-heavy websites 1 second to render the JS text on screen
            await new Promise(r => setTimeout(r, 1000));
            
            title = await page.title() || 'No Title';
            text = await page.evaluate(() => {
                // Basic cleanup of junk before taking innerText
                ['script', 'style', 'nav', 'footer', 'iframe'].forEach(tag => {
                    document.querySelectorAll(tag).forEach(e => e.remove());
                });
                return document.body.innerText.replace(/\s+/g, ' ').trim();
            });
            
            await browser.close();
        }
        
        const unixTime = Math.floor(Date.now() / 1000);
        const slugTitle = title.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'web-clip';
        const filename = `${slugTitle}-${unixTime}.md`;
        
        const meta = {
            "title": title,
            "source_path": url,
            "created_at": new Date().toISOString(),
            "tags": ["whatsapp-bot"],
            "mime": "text/html"
        };
        const frontmatter = `---\n${JSON.stringify(meta, null, 2)}\n---\n`;
        const content = `${frontmatter}# ${title}\n\nURL: ${url}\n\n## Raw Content\n${text}`;
        
        fs.writeFileSync(path.join(DATA_DIR, filename), content);
        return { success: true, title, summary: "Saved seamlessly to KB/raw!" };
        
    } catch (error) {
        if (browser) await browser.close();
        console.error('Ingest error:', error);
        return { success: false, error: error.message };
    }
}

async function ingestRawText(rawText) {
    try {
        console.log(`[Ingest] Ingesting raw text snippet...`);
        const unixTime = Math.floor(Date.now() / 1000);
        const filename = `note-${unixTime}.md`;
        
        const meta = {
            "title": "WhatsApp Note",
            "source_path": "whatsapp://text",
            "created_at": new Date().toISOString(),
            "tags": ["whatsapp-note"],
            "mime": "text/plain"
        };
        const frontmatter = `---\n${JSON.stringify(meta, null, 2)}\n---\n`;
        const content = `${frontmatter}${rawText}`;
        
        fs.writeFileSync(path.join(DATA_DIR, filename), content);
        return { success: true, title: 'Text Note', summary: "Note saved seamlessly to KB/raw!" };
        
    } catch (error) {
        console.error('Ingest text error:', error);
        return { success: false, error: error.message };
    }
}

module.exports = { extractUrls, ingestUrl, ingestRawText };
