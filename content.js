// content.js
function getFingerprint() {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillText("canvas-fingerprint", 2, 2);
    const canvasHash = btoa(canvas.toDataURL());

    const gl = document.createElement("canvas").getContext("webgl");
    const webglHash = gl ? btoa(gl.getParameter(gl.VENDOR) + gl.getParameter(gl.RENDERER)) : "N/A";

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const audioHash = oscillator.toString();
    oscillator.disconnect();

    return {
      userAgent: navigator.userAgent,
      screen: `${screen.width}x${screen.height}`,
      language: navigator.language,
      canvasHash: canvasHash,
      webglHash: webglHash,
      audioHash: audioHash,
      plugins: navigator.plugins ? Array.from(navigator.plugins).map(p => p.name).join(", ") : "N/A"
    };
  } catch (error) {
    console.error("Fingerprinting error:", error);
    return { error: error.message };
  }
}

chrome.runtime.sendMessage({ type: "deviceFingerprint", data: getFingerprint() }, () => {
  if (chrome.runtime.lastError) console.error("Failed to send fingerprint:", chrome.runtime.lastError);
});

// DNS Detection with improved performance
const DNS_CACHE_KEY = "dnsCache";
const FETCH_TIMEOUT = 3000;

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

async function fetchWithRetry(url, options = {}, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetchWithTimeout(url, options);
      return response;
    } catch (error) {
      if (i === retries) throw error;
      console.warn(`Retrying fetch for ${url}, attempt ${i + 1}`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

async function detectDNS() {
  try {
    const cache = await new Promise(resolve => chrome.storage.local.get([DNS_CACHE_KEY], result => resolve(result[DNS_CACHE_KEY] || {})));
    const currentDomain = window.location.hostname;
    const cacheKey = `${currentDomain}_dns`;

    if (cache[cacheKey]) {
      console.log("Using cached DNS results:", cache[cacheKey]);
      sendDNSResults(cache[cacheKey].userDNS, cache[cacheKey].websiteDNS);
      return;
    }

    const userDNSPromise = detectUserDNS();
    const websiteDNSPromise = detectWebsiteDNS();

    Promise.allSettled([userDNSPromise, websiteDNSPromise]).then(results => {
      const userDNSResult = results[0].status === "fulfilled" ? results[0].value : "Detection failed";
      const websiteDNSResult = results[1].status === "fulfilled" ? results[1].value : "Detection failed";

      cache[cacheKey] = { userDNS: userDNSResult, websiteDNS: websiteDNSResult };
      chrome.storage.local.set({ [DNS_CACHE_KEY]: cache }, () => console.log("DNS results cached for", currentDomain));
      sendDNSResults(userDNSResult, websiteDNSResult);
    });
  } catch (error) {
    console.error("DNS detection error:", error);
  }
}

async function detectUserDNS() {
  const services = [
    { url: "https://whoami.akamai.net/", parse: data => data.trim() || "Unknown (Akamai)" },
    { url: "https://dns.google/resolve?name=whoami.akamai.net", parse: data => data.Answer?.[0]?.data || "Unknown (Google DNS)" }
  ];

  for (const service of services) {
    try {
      const response = await fetchWithRetry(service.url, { headers: { "accept": "application/json" } });
      const data = service.url.includes("google") ? await response.json() : await response.text();
      const result = service.parse(data);
      console.log("User DNS detected via", service.url, ":", result);
      return result;
    } catch (error) {
      console.error(`User DNS detection failed via ${service.url}:`, error.message);
      if (service === services[services.length - 1]) return "Error: " + error.message;
    }
  }
}

async function detectWebsiteDNS() {
  const websiteDomain = window.location.hostname;
  const dohUrl = `https://1.1.1.1/dns-query?name=${encodeURIComponent(websiteDomain)}&type=A`;

  try {
    const response = await fetchWithRetry(dohUrl, { headers: { "accept": "application/dns-json" } });
    const data = await response.json();
    if (data.Answer && data.Answer.length > 0) {
      const result = data.Answer[0].data || "Unknown (Cloudflare)";
      console.log("Website DNS detected:", result);
      return result;
    } else {
      console.log("Website DNS detection: No answer received");
      return "No DNS answer received";
    }
  } catch (error) {
    console.error("Website DNS detection failed:", error.message);
    return "Error: " + error.message;
  }
}

function sendDNSResults(userDNS, websiteDNS) {
  const dnsData = { dnsServers: userDNS, websiteDNS: websiteDNS };
  console.log("Sending DNS results:", dnsData);
  chrome.runtime.sendMessage({ type: "dnsDetection", data: dnsData }, () => {
    if (chrome.runtime.lastError) console.error("Failed to send DNS results:", chrome.runtime.lastError);
  });
}

detectDNS();

let behaviorData = { moves: 0, keys: 0, scroll: 0 };
document.addEventListener("mousemove", () => behaviorData.moves++);
document.addEventListener("keydown", () => behaviorData.keys++);
window.addEventListener("scroll", () => behaviorData.scroll = Math.max(behaviorData.scroll, window.scrollY / document.body.scrollHeight * 100));

setInterval(() => {
  if (behaviorData.moves > 50 || behaviorData.keys > 20 || behaviorData.scroll > 50) {
    chrome.runtime.sendMessage({ type: "behavior_tracking", data: { ...behaviorData } }, () => {
      if (chrome.runtime.lastError) console.error("Failed to send behavior data:", chrome.runtime.lastError);
    });
    behaviorData = { moves: 0, keys: 0, scroll: 0 };
  }
}, 60000);

function detectCrossSite() {
  try {
    const scripts = Array.from(document.scripts).map(script => script.src).filter(src => src);
    const domains = new Set(scripts.map(src => new URL(src).hostname));
    chrome.cookies.getAll({}, cookies => {
      const crossSite = cookies.filter(cookie => domains.has(cookie.domain.split('.').slice(-2).join('.')) && cookie.domain !== location.hostname);
      if (crossSite.length > 0) {
        chrome.runtime.sendMessage({ type: "cross_site_tracking", data: crossSite }, () => {
          if (chrome.runtime.lastError) console.error("Failed to send cross-site data:", chrome.runtime.lastError);
        });
      }
    });
  } catch (error) {
    console.error("Cross-site detection error:", error);
  }
}

(function() {
  try {
    const keywords = ["ga_", "fb_", "track", "pixel", "fp"];
    const items = Object.keys(localStorage).reduce((acc, key) => {
      if (keywords.some(keyword => key.includes(keyword))) {
        acc.push({ key: key, value: localStorage.getItem(key) });
      }
      return acc;
    }, []);
    if (items.length > 0) {
      chrome.runtime.sendMessage({ type: "localStorage_tracking", data: items }, () => {
        if (chrome.runtime.lastError) console.error("Failed to send localStorage data:", chrome.runtime.lastError);
      });
    }

    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(...args) {
      if (!this._fpDetected) {
        this._fpDetected = true;
        chrome.runtime.sendMessage({ type: "canvas_fingerprint_detected", data: { url: location.href } }, () => {
          if (chrome.runtime.lastError) console.error("Failed to send fingerprint detection:", chrome.runtime.lastError);
        });
      }
      return originalToDataURL.apply(this, args);
    };

    chrome.runtime.onMessage.addListener(message => {
      if (message.type === "widget_notification") {
        const widget = document.createElement("div");
        Object.assign(widget.style, {
          position: "fixed",
          bottom: "10px",
          right: "10px",
          zIndex: "999999",
          backgroundColor: "#ffeb3b",
          color: "#000",
          padding: "8px 12px",
          borderRadius: "5px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          opacity: "0",
          transition: "opacity 0.3s"
        });
        widget.textContent = message.message;
        document.body.appendChild(widget);
        requestAnimationFrame(() => { widget.style.opacity = "1"; });
        setTimeout(() => {
          widget.style.opacity = "0";
          setTimeout(() => widget.remove(), 300);
        }, 5000);
      }
    });

    detectCrossSite();
  } catch (error) {
    console.error("Initialization error:", error);
  }
})();