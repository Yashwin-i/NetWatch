# NET-WATCH // Digital Sovereignty & Privacy Audit Tool

![Status](https://img.shields.io/badge/Status-Live-success) ![Compliance](https://img.shields.io/badge/Compliance-DPDP%20Act%202023-blue) 


## 🚨 The Problem
The Digital Personal Data Protection (DPDP) Act 2023 mandates that user data must be handled securely. However, users have no visibility into:
1.  **Data Exfiltration:** Where is my data actually going? (USA? China?)
2.  **Hidden Tracking:** What creates "Digital Fingerprints" beyond simple cookies?
3.  **Obfuscated Payloads:** What secret data is hidden inside encrypted API calls?

## 🛡️ The Solution: NET-WATCH
NET-WATCH is a **real-time forensic auditing tool** that performs Deep Packet Inspection (DPI) on web traffic. Unlike static scanners, it launches a **headless browser instance** to execute and disa[...] 

## ✨ Key Capabilities

### 1. 🌍 3D Data Sovereignty Map
* **Real-time Geo-Tracing:** Resolves IP addresses of every API request to physical locations.
* **Sovereignty Meter:** Calculates the exact percentage of data remaining within Indian borders vs. foreign exfiltration.

### 2. 🕵️ Deep Packet Forensics
* **Payload Interception:** Captures POST/GET data leaving the browser.
* **Auto-Decryption:** Built-in heuristic engine to detect and decode **Base64 obfuscated payloads**, revealing hidden PII (Personally Identifiable Information) leaks.

### 3. 🍪 Storage & Security Audit
* **Cookie Forensics:** Distinguishes between Session (Transient) and Persistent (Tracking) storage.
* **SSL/TLS Inspection:** Verifies the cryptographic integrity of the connection.

## 🛠️ Tech Stack
* **Core:** Node.js, Express
* **Engine:** Puppeteer (Headless Chrome) for DOM rendering and network interception.
* **Real-time:** Socket.io for bi-directional event streaming.
* **Visualization:** Three.js / Globe.gl for 3D geospatial rendering.
* **Deployment:** Dockerized container on Render Cloud.

## 🚀 How to Run
1.  **Clone the Repo**
2.  `npm install`
3.  `node server.js`
4.  Navigate to `localhost:3000`

---
*Built for a Hackathon. Defending Digital India.*
