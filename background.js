// background.js
const trackers = ["doubleclick.net", "googleadservices.com", "facebook.com", "adnxs.com", "scorecardresearch.com"];
const adDomains = ["ad.doubleclick.net", "pagead2.googlesyndication.com", "googleadservices.com"];
const THROTTLE = 60000, ONE_WEEK = 604800000, MAX_LOGS = 1000;
let lastNotifs = {}, queue = [], timer;
let activeTabs = new Map();

(async () => {
  function flushQueue() {
    if (queue.length > 0) {
      chrome.storage.local.get({ trackingLogs: [] }, ({ trackingLogs }) => {
        trackingLogs.unshift(...queue);
        if (trackingLogs.length > MAX_LOGS) trackingLogs.length = MAX_LOGS;
        chrome.storage.local.set({ trackingLogs }, () => {
          console.log("Logs flushed to storage:", queue.length);
          chrome.runtime.sendMessage({ type: "logs_updated", data: queue });
        });
      });
      queue = [];
      timer = null;
    }
  }

  async function fetchLocation() {
    try {
      const response = await fetch("https://ipinfo.io/json");
      const data = await response.json();
      const loc = {
        ip: data.ip,
        city: data.city,
        region: data.region,
        country: data.country,
        loc: data.loc,
        org: data.org || "N/A",
        timezone: data.timezone || "N/A"
      };
      chrome.storage.local.set({ locationData: loc });
      queueLog({ action: "deviceLocation", data: loc, timestamp: Date.now() });
      chrome.runtime.sendMessage({ type: "deviceLocation", data: loc });
    } catch (error) {
      console.error("Location fetch failed:", error);
      queueLog({ action: "deviceLocation", data: { error: error.message }, timestamp: Date.now() });
    }
  }

  function queueLog(entry) {
    console.log("Queueing log:", entry);
    queue.push(entry);
    if (!timer) timer = setTimeout(flushQueue, 1000);
  }

  setInterval(() => {
    chrome.storage.local.get({ trackingLogs: [] }, ({ trackingLogs }) => {
      const cutoff = Date.now() - ONE_WEEK;
      const filteredLogs = trackingLogs.filter(log => log.timestamp >= cutoff);
      if (filteredLogs.length !== trackingLogs.length) {
        chrome.storage.local.set({ trackingLogs: filteredLogs });
      }
    });
  }, 3600000);

  chrome.webRequest.onHeadersReceived.addListener(
    details => {
      try {
        const domain = new URL(details.url).hostname;
        if (trackers.concat(adDomains).some(d => domain.includes(d))) {
          return { responseHeaders: details.responseHeaders.filter(header => header.name.toLowerCase() !== "set-cookie") };
        }
        const etagHeader = details.responseHeaders.find(header => header.name.toLowerCase() === "etag");
        if (etagHeader) {
          queueLog({ type: "etag", value: etagHeader.value, url: details.url, domain, timestamp: Date.now(), source: "cache_tracking" });
        }
        return { responseHeaders: details.responseHeaders };
      } catch (error) {
        console.error("Error in onHeadersReceived:", error);
      }
    },
    { urls: ["<all_urls>"] },
    ["blocking", "responseHeaders", "extraHeaders"]
  );

  chrome.webRequest.onBeforeRequest.addListener(
    details => {
      try {
        const domain = new URL(details.url).hostname;
        if (adDomains.some(d => domain.includes(d)) || details.url.includes("beacon") || details.url.includes("pixel")) {
          queueLog({ type: details.type, url: details.url, domain, timestamp: Date.now(), source: "network_tracking" });
          return { cancel: adDomains.some(d => domain.includes(d)) };
        }
      } catch (error) {
        console.error("Error in onBeforeRequest:", error);
      }
    },
    { urls: ["<all_urls>"] },
    ["blocking"]
  );

  function updateBadge() {
    chrome.storage.sync.get("badgeColor", ({ badgeColor = "red" }) => {
      chrome.action.setBadgeText({ text: "•" });
      chrome.action.setBadgeBackgroundColor({ color: badgeColor });
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 5000);
    });
  }

  function notify(title, message) {
    const now = Date.now();
    if (!lastNotifs[title] || now - lastNotifs[title] > THROTTLE) {
      chrome.notifications.create("", {
        type: "basic",
        iconUrl: "icon.png",
        title: title,
        message: message,
        priority: 2
      }, () => {});
      lastNotifs[title] = now;
    }
  }

  function handleEvent(log, tabId) {
    chrome.storage.sync.get({ trackingActive: true }, ({ trackingActive }) => {
      if (!trackingActive) return;
      queueLog(log);
      chrome.runtime.sendMessage({ type: "cookie_tracking", data: log }, () => {
        console.log("Sent cookie_tracking message:", log);
      });
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { type: "widget_notification", message: `${log.cookieName} @ ${log.domain}` }, () => {
          if (chrome.runtime.lastError) {
            console.error("Failed to send widget notification:", chrome.runtime.lastError);
          }
        });
      }
      updateBadge();
    });
  }

  chrome.cookies.onChanged.addListener(change => {
    try {
      if (change.cause !== "explicit") return;
      const log = { cookieName: change.cookie.name, domain: change.cookie.domain, value: change.cookie.value, timestamp: Date.now(), source: "onChanged" };
      handleEvent(log);
      chrome.storage.local.get({ cookieCount: 0, trackerCount: 0 }, data => {
        chrome.storage.local.set({
          cookieCount: data.cookieCount + 1,
          trackerCount: trackers.some(t => change.cookie.domain.includes(t)) ? data.trackerCount + 1 : data.trackerCount
        });
      });
    } catch (error) {
      console.error("Error in onChanged:", error);
    }
  });

  chrome.webRequest.onCompleted.addListener(
    details => {
      try {
        chrome.storage.sync.get({ trackingActive: true }, ({ trackingActive }) => {
          if (!trackingActive || !["xmlhttprequest", "script", "image"].includes(details.type)) return;
          const domain = new URL(details.url).hostname;
          chrome.cookies.getAll({ url: details.url }, cookies => {
            cookies.forEach(cookie => {
              if (!cookie.domain.includes(domain) || trackers.some(t => cookie.domain.includes(t))) {
                const log = { cookieName: cookie.name, domain: cookie.domain, value: cookie.value, timestamp: Date.now(), source: "onCompleted" };
                handleEvent(log, details.tabId);
                notify("Cookie Tracker", `${cookie.name} @ ${cookie.domain}`);
              }
            });
          });
        });
      } catch (error) {
        console.error("Error in onCompleted:", error);
      }
    },
    { urls: ["<all_urls>"] }
  );

  chrome.tabs.onCreated.addListener(tab => {
    try {
      if (tab.url && !tab.url.startsWith("chrome://")) {
        const domain = new URL(tab.url).hostname;
        activeTabs.set(tab.id, { url: tab.url, domain, openTime: Date.now() });
      }
    } catch (error) {
      console.error("Error in onCreated:", error);
    }
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    try {
      if (changeInfo.url && !changeInfo.url.startsWith("chrome://")) {
        const domain = new URL(changeInfo.url).hostname;
        activeTabs.set(tabId, { url: changeInfo.url, domain, openTime: Date.now() });
      }
    } catch (error) {
      console.error("Error in onUpdated:", error);
    }
  });

  chrome.tabs.onRemoved.addListener(tabId => {
    try {
      const session = activeTabs.get(tabId);
      if (session) {
        chrome.cookies.getAll({ url: session.url }, cookies => {
          const sessionData = {
            url: session.url,
            domain: session.domain,
            openTime: session.openTime,
            closeTime: Date.now(),
            cookieSnapshot: cookies.map(c => ({ name: c.name, domain: c.domain, value: c.value }))
          };
          chrome.storage.sync.get({ historySessions: [] }, ({ historySessions }) => {
            historySessions.unshift(sessionData);
            if (historySessions.length > 50) historySessions.pop();
            chrome.storage.sync.set({ historySessions });
          });
          activeTabs.delete(tabId);
        });
      }
    } catch (error) {
      console.error("Error in onRemoved:", error);
    }
  });

  chrome.runtime.onMessage.addListener((message, sender) => {
    try {
      if (message.type === "localStorage_tracking") {
        message.data.forEach(item => {
          const log = { cookieName: item.key, domain: sender.tab?.url ? new URL(sender.tab.url).hostname : "localStorage", value: item.value, timestamp: Date.now(), source: "localStorage" };
          handleEvent(log, sender.tab?.id);
          notify("LocalStorage Alert", `Key: ${item.key}`);
        });
      } else if (message.type === "canvas_fingerprint_detected") {
        notify("Fingerprinting Alert", "Canvas fingerprinting detected!");
      } else if (message.type === "behavior_tracking") {
        queueLog({ type: "behavior", data: message.data, timestamp: Date.now(), source: "behavior_tracking" });
      } else if (message.type === "cross_site_tracking") {
        message.data.forEach(cookie => queueLog({ cookieName: cookie.name, domain: cookie.domain, value: cookie.value, timestamp: Date.now(), source: "cross_site_tracking" }));
      } else if (message.type === "deviceFingerprint") {
        chrome.storage.local.set({ deviceFingerprint: message.data });
        queueLog({ action: "deviceFingerprint", data: message.data, timestamp: Date.now() });
      } else if (message.type === "dnsDetection") {
        console.log("Received DNS detection message:", message.data);
        chrome.storage.local.set({ dnsServers: message.data.dnsServers, websiteDNS: message.data.websiteDNS });
        queueLog({ action: "dnsDetection", data: message.data, timestamp: Date.now() });
      }
    } catch (error) {
      console.error("Error in onMessage:", error);
    }
  });

  await fetchLocation();
  setInterval(fetchLocation, 3600000);
})();