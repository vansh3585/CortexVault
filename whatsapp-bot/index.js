const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { handleMessage } = require('./handler');

console.log('Initializing WhatsApp Client (this might take a few seconds)...');

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './bot-data/session' }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('\n======================================================');
    console.log('📱 SCAN THIS QR CODE WITH YOUR WHATSAPP (Linked Devices):');
    console.log('======================================================\n');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('\n✅ WhatsApp Bot is Ready and connected!');
    console.log('You can now send URLs or questions to yourself in WhatsApp.');
});

client.on('message_create', async msg => {
    try {
        const chat = await msg.getChat();
        
        // 1. Instantly drop all groups
        if (chat.isGroup) return;
        
        // 2. Instantly drop messages sent by other people to you
        if (!msg.fromMe) return;
        
        // 3. Use WhatsApp Web's official API to verify this is the "Message Yourself" chat!
        const contact = await chat.getContact();
        if (!contact.isMe) {
             // You sent a DM to a friend. Ignore it instantly.
             return;
        }
        
    } catch (e) {
        console.error("Failed to verify chat privacy.", e);
        return;
    }

    // 4. Ignore Bot's automated responses
    const ignorePrefixes = ['⏳', '✅', '❌', '⚠️', '📚', '=>', '\\[Ingest\\]'];
    if (ignorePrefixes.some(p => msg.body && msg.body.trim().startsWith(p))) {
        return;
    }

    console.log(`\n[SAFE EVENT: Note to Self]`);
    console.log(`[CONTENT] ${msg.body}`);
    
    await handleMessage(client, msg);
});

client.on('message', async msg => {
    // Deliberately silencing raw incoming message logs so you don't see 
    // group chats flooding your terminal anymore!
});

client.initialize();
