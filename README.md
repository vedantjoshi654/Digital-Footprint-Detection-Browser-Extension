
# 🛡️ Digital Footprint Detection Browser Extension

A privacy-centric Chrome/Chromium browser extension that detects trackers, cookies, fingerprints, and security signals in real-time — analyzes a browsing session’s digital footprint and presents actionable insights.

## 🚀 Project Overview

Modern web browsing exposes users to a mix of tracking mechanisms — from simple cookies to complex device fingerprinting techniques. Traditional tools often offer fragmented or raw data with limited visibility. This extension centralizes multiple layers of browser privacy analysis into a unified, interactive dashboard, empowering users to understand and control their digital exposure.

Through real-time monitoring and risk scoring, the extension evaluates each visited website on privacy and security parameters, helping users make informed decisions about their online behavior.


## 🧩 Key Features

| Feature | Description |
|---------|-------------|
| 🍪 **Cookie Monitoring** | Enumerates cookies set by first- and third-party domains. |
| 👣 **Tracker Detection** | Flags known tracking domains and third-party scripts. |
| 🧠 **Fingerprint Analysis** | Identifies common fingerprinting elements in the current page. |
| 📊 **Dynamic Risk Score** | Computes a session privacy risk score based on detected elements. |
| 🔐 **Security Signals** | Captures and displays SSL/TLS certificate details of the current site. |
| 📁 **Export Reports** | Export collected session data as structured CSV or Excel files. |
| 🌗 **UI Themes** | Supports light/dark mode for better accessibility. |
| ⚙️ **Real-Time Updates** | Runs continuously while browsing to update insights live. 



## 🛠️ How It Works (Technical Architecture)

This extension uses Chrome’s *Manifest V3* APIs along with content and background scripts to perform deep session analysis:

### 📌 1. Manifest (`manifest.json`)
Defines:
- Required permissions (`cookies`, `activeTab`, `webRequest`, etc.)
- All scripts (background, content, popup)
- Icons and UI placements

This is the core metadata file that tells Chrome how to load/execute the extension.

### 📌 2. Content Script (`content.js`)
Injected into each web page:
- Inspects webpage DOM
- Extracts fingerprinting markers
- Detects scripts, iframes, and tracker behavior

Data collected here is passed to the background script via Chrome’s messaging API.

### 📌 3. Background Script (`background.js`)
Acts as a long-running controller:
- Receives messages from content scripts
- Aggregates tracking/cookie/fingerprint data
- Computes the *privacy risk score*
- Stores session data temporarily
- Handles communication with the popup UI

The background context persists across page navigations.

### 📌 4. Popup UI (`popup.html`, `popup.js`, `styles.css`)
User Interaction Layer:
- Displays session summary, cookie/tracker lists, and risk score
- Allows *Export* and *Theme Selection*
- Offers intuitive charts/tables for quick insights

The UI queries the background script for the latest aggregated data.

### 📌 5. Data Encryption (Optional Utility, e.g., `dataEncryption.js`)
If present, this utility can:
- Secure sensitive storage in `chrome.storage` or IndexedDB
- Hash or encrypt data before export or storage

Use this for safeguarding user data while persisting or exporting reports.


## 📦 Repository Structure

Digital-Footprint-Detection-Browser-Extension/
├── background.js            # Manages global extension logic

├── content.js               # Page-level scanning for trackers/fingerprint

├── dataEncryption.js        # (Optional) Secure storage/encryption utilities

├── icon.png                 # Extension icon

├── manifest.json            # Chrome extension metadata & permissions

├── popup.html               # Popup dashboard UI

├── popup.js                 # Popup UI controller

├── styles.css               # UI styling

└── README.md                # Project documentation



## 📥 Installation (For Developers & Testers)

To install locally for testing or development:

1. Clone the repository

   bash
   git clone https://github.com/vedantjoshi654/Digital-Footprint-Detection-Browser-Extension.git


2. Open Chrome/Edge/Brave
   Go to:

   
   chrome://extensions/
   
3. Enable Developer Mode
   Toggle the switch in the top-right corner.
4. Load unpacked extension
   Click `Load unpacked` and select the cloned project directory.
5. The extension icon will appear in the toolbar — click it to view the dashboard.


## 🎯 Using the Extension

1. Visit any website.
2. Click the extension toolbar icon.
3. The popup will show:

   * List of detected cookies
   * Identified trackers & fingerprint signals
   * Session risk score
   * SSL/TLS status and security flags
   * Export options (CSV/Excel)

Note: You may need to grant specific permissions if prompted.


## 🛡️ Risk Scoring Explained

The extension creates a **composite risk score** based on:

* Number and type of trackers
* Presence of persistent cookies
* Evidence of fingerprinting patterns
* Security indicators from certificate information

Scores help users quickly assess how “privacy aggressive” a session or site is.



## 🧪 Developer Notes

* The extension uses Chrome **Manifest V3** event-driven background scripts.
* Messaging between content and background layers uses `chrome.runtime.sendMessage`.
* Persistent data (if any) should use `chrome.storage.local` or IndexedDB for scoped browser storage.
* IndexedDB may be used to store larger session logs and export history.


## 🤝 Contributing

Contributions are welcome — whether:

* Improving detection heuristics
* Adding new threat signals (e.g., WebRTC leaks)
* Enhancing UI visualizations
* Supporting Firefox/Edge cross-compatibility

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/xyz`).
3. Submit a pull request with detailed description.



## 📜 License

This project is open-source.

