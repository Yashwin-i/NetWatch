const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const puppeteer = require('puppeteer');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// --- MEMORY STORAGE ---
const geoCache = {}; 
let sessionHistory = []; 

// --- BASE64 DECODER UTILITY ---
function tryDecode(str) {
    if (!str) return null;
    try {
        // Basic check if string looks like Base64 (len multiple of 4, valid chars)
        if (str.length > 20 && str.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(str)) {
             const decoded = Buffer.from(str, 'base64').toString('utf-8');
             // Only return if it looks like readable text/JSON (not binary garbage)
             if (/[\x20-\x7E]/.test(decoded)) return decoded;
        }
        return str;
    } catch (e) { return str; }
}

io.on('connection', (socket) => {
    console.log('User connected to War Room');

    // Handle history request from new tabs (e.g., Map page)
    socket.on('request-history', () => {
        socket.emit('traffic-history', sessionHistory);
    });

    socket.on('start-tracking', async (targetUrl) => {
        let browser;
        try {
            sessionHistory = []; // Clear history for new scan

            // Normalize URL
            if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;
            const mainDomain = new URL(targetUrl).hostname.replace('www.', '');

            // --- STEALTH LAUNCH CONFIGURATION ---
            browser = await puppeteer.launch({ 
                headless: "new",
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage', // Critical for Docker/Cloud memory
                    '--disable-blink-features=AutomationControlled', // Hides "Navigator.webdriver"
                    '--window-size=1920,1080', // Looks like a real desktop
                    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                ]
            });
            
            const page = await browser.newPage();
            
            // Set real viewport size
            await page.setViewport({ width: 1920, height: 1080 });

            // Mask the "webdriver" property that screams "I am a bot"
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false,
                });
            });

            await page.setRequestInterception(true);

            // --- FEATURE: SECURITY AUDIT (SSL/TLS) ---
            page.on('response', response => {
                // Check if this is the main page loading
                if (response.url() === targetUrl || response.url() === targetUrl + '/') {
                    const security = response.securityDetails();
                    if (security) {
                        io.emit('security-update', {
                            protocol: security.protocol(),
                            issuer: security.issuer(),
                            validTo: new Date(security.validTo() * 1000).toLocaleDateString()
                        });
                    }
                }
            });

            // --- TRAFFIC ANALYSIS ---
            page.on('request', async (request) => {
                const reqUrl = request.url();
                const method = request.method();
                const type = request.resourceType();
                const reqDomain = new URL(reqUrl).hostname;
                
                // Capture and Decode Payload
                const rawPost = request.postData();
                const finalPayload = tryDecode(rawPost) || rawPost;

                let violations = [];
                let isTracker = false;

                // Rule A: Unencrypted HTTP
                if (reqUrl.startsWith('http://')) {
                    violations.push({ issue: "Unencrypted (HTTP)", severity: "high" });
                }

                // Rule B: Third-Party Tracker
                const knownTrackers = ['analytics', 'pixel', 'tracker', 'telemetry', 'adsystem', 'doubleclick', 'facebook', 'tiktok', 'clarity'];
                if (knownTrackers.some(k => reqUrl.toLowerCase().includes(k))) {
                    isTracker = true;
                    if (!reqDomain.includes(mainDomain)) {
                        violations.push({ issue: "3rd Party Tracker", severity: "medium" });
                    } else {
                        violations.push({ issue: "Hidden 1st Party Tracker", severity: "medium" });
                    }
                }

                // Rule C: PII Leak (Regex check for emails)
                if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(reqUrl) || (finalPayload && /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(finalPayload))) {
                    violations.push({ issue: "PII (Email) Leak", severity: "critical" });
                }

                // 2. GEO-LOCATION TRACE
                let geoData = { lat: 20.5937, lon: 78.9629, country: 'India' }; // Default fallback
                
                if (reqDomain !== 'localhost' && !reqDomain.startsWith('192.168')) {
                    if (geoCache[reqDomain]) {
                        geoData = geoCache[reqDomain];
                    } else {
                        try {
                            // Using ip-api.com (Free tier)
                            const response = await axios.get(`http://ip-api.com/json/${reqDomain}`);
                            if (response.data.status === 'success') {
                                geoData = {
                                    lat: response.data.lat,
                                    lon: response.data.lon,
                                    country: response.data.country
                                };
                                geoCache[reqDomain] = geoData; 
                            }
                        } catch (e) {
                            // Silently fail on Geo API error to keep app running
                        }
                    }
                }

                const dataPacket = {
                    url: reqUrl,
                    method,
                    type,
                    domain: reqDomain,
                    violations,
                    geo: geoData,
                    isTracker,
                    payload: finalPayload // Sending the decoded evidence
                };

                // Store in history and emit to all clients
                sessionHistory.push(dataPacket);
                io.emit('traffic-update', dataPacket);

                request.continue();
            });

            // Navigate to page (Increased timeout for cloud latency)
            await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
            
            // Wait extra time for lazy trackers to fire
            await new Promise(r => setTimeout(r, 6000));

            // --- FEATURE: COOKIE FORENSICS ---
            const cookies = await page.cookies();
            io.emit('cookie-update', cookies);

            io.emit('status', 'Scan Complete.');
            await browser.close();

        } catch (error) {
            io.emit('status', `Error: ${error.message}`);
            if (browser) await browser.close();
        }
    });
});

// Use Cloud Port (Render uses PORT env var) or fallback to 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});