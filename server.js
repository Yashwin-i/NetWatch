const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const puppeteer = require('puppeteer');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const geoCache = {}; 
let sessionHistory = []; 

// Base64 Decoder
function tryDecode(str) {
    if (!str) return null;
    try {
        if (str.length > 20 && str.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(str)) {
             const decoded = Buffer.from(str, 'base64').toString('utf-8');
             if (/[\x20-\x7E]/.test(decoded)) return decoded;
        }
        return str;
    } catch (e) { return str; }
}

io.on('connection', (socket) => {
    console.log('User connected');

    socket.on('request-history', () => {
        socket.emit('traffic-history', sessionHistory);
    });

    socket.on('start-tracking', async (targetUrl) => {
        let browser;
        try {
            sessionHistory = []; 

            if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;
            const mainDomain = new URL(targetUrl).hostname.replace('www.', '');

            browser = await puppeteer.launch({ 
                headless: "new",
                args: ['--no-sandbox', '--disable-setuid-sandbox'] 
            });
            
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setRequestInterception(true);

            // --- FEATURE: SECURITY AUDIT ---
            // Listen for the main document response to check SSL
            page.on('response', response => {
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

            page.on('request', async (request) => {
                const reqUrl = request.url();
                const method = request.method();
                const type = request.resourceType();
                const reqDomain = new URL(reqUrl).hostname;
                
                const rawPost = request.postData();
                const finalPayload = tryDecode(rawPost) || rawPost;

                let violations = [];
                let isTracker = false;

                if (reqUrl.startsWith('http://')) {
                    violations.push({ issue: "Unencrypted (HTTP)", severity: "high" });
                }

                const knownTrackers = ['analytics', 'pixel', 'tracker', 'telemetry', 'adsystem', 'doubleclick', 'facebook', 'tiktok', 'clarity'];
                if (knownTrackers.some(k => reqUrl.toLowerCase().includes(k))) {
                    isTracker = true;
                    if (!reqDomain.includes(mainDomain)) {
                        violations.push({ issue: "3rd Party Tracker", severity: "medium" });
                    } else {
                        violations.push({ issue: "Hidden 1st Party Tracker", severity: "medium" });
                    }
                }

                if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(reqUrl) || (finalPayload && /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(finalPayload))) {
                    violations.push({ issue: "PII (Email) Leak", severity: "critical" });
                }

                let geoData = { lat: 20.5937, lon: 78.9629, country: 'India' };
                
                if (reqDomain !== 'localhost' && !reqDomain.startsWith('192.168')) {
                    if (geoCache[reqDomain]) {
                        geoData = geoCache[reqDomain];
                    } else {
                        try {
                            const response = await axios.get(`http://ip-api.com/json/${reqDomain}`);
                            if (response.data.status === 'success') {
                                geoData = {
                                    lat: response.data.lat,
                                    lon: response.data.lon,
                                    country: response.data.country
                                };
                                geoCache[reqDomain] = geoData;
                            }
                        } catch (e) {}
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
                    payload: finalPayload
                };

                sessionHistory.push(dataPacket);
                io.emit('traffic-update', dataPacket);

                request.continue();
            });

            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
            await new Promise(r => setTimeout(r, 4000));

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

const PORT = process.env.PORT || 3000; // Use Cloud Port or 3000
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});