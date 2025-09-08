// popup.js
document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  // Ensure Chart.js is loaded
  function loadChartJS(callback) {
    const script = document.createElement('script');
    script.src = "https://cdn.jsdelivr.net/npm/chart.js";
    script.onload = callback;
    script.onerror = () => console.error("Failed to load Chart.js");
    document.head.appendChild(script);
  }

  // Constants
  const defaultWeights = { thirdParty: 1, secure: 0.5, httpOnly: 0.5, sameSite: 0.5, expiration: 1, tracker: 1 };
  const trackers = ["doubleclick.net", "googleadservices.com", "facebook.com", "adnxs.com", "scorecardresearch.com"];
  const langs = {
    en: {
      highRiskWarning: "Warning: High risk website detected!",
      siteLabel: "Site: ",
      riskScoreLabel: "Risk Score: ",
      noLogs: "No logs yet.",
      noCookies: "No cookies found.",
      noHistory: "No history available.",
      remediateSuccess: "Removed {count} cookies for {url}.",
      settingsSaved: "Settings saved! Reloading risk analysis!"
    },
    es: {
      highRiskWarning: "Advertencia: ¡Sitio de alto riesgo detectado!",
      siteLabel: "Sitio: ",
      riskScoreLabel: "Puntuación de riesgo: ",
      noLogs: "No hay registros aún.",
      noCookies: "No se encontraron cookies.",
      noHistory: "No hay historial disponible.",
      remediateSuccess: "Se eliminaron {count} cookies para {url}.",
      settingsSaved: "¡Configuración guardada! Recargando análisis de riesgo!"
    }
  };
  let currentLanguage = "en";
  const ONE_WEEK = 604800000;

  // Utility Functions
  function getLangString(key) {
    return langs[currentLanguage][key] || key;
  }

  function tryDecodeJWT(cookieValue) {
    const parts = cookieValue.split(".");
    if (parts.length !== 3) return null;
    try {
      return {
        header: JSON.parse(atob(parts[0])),
        payload: JSON.parse(atob(parts[1])),
        signature: parts[2]
      };
    } catch (error) {
      return null;
    }
  }

  function determineEncryptionMethod(value) {
    if (value.startsWith("fb.") && value.split(".").length === 4) return "Facebook-like";
    if (/^[A-Za-z0-9+/=]+$/.test(value)) return "Base64";
    if (value.includes("%")) return "URL Encoding";
    return "Plain";
  }

  function decodeCookieValue(value, method) {
    let decoded = value;
    try {
      decoded = method === "Base64" ? atob(value) : method === "URL Encoding" ? decodeURIComponent(value) : value;
    } catch (error) {
      decoded = `${method} decode failed`;
    }
    try {
      decoded = JSON.stringify(JSON.parse(decoded), null, 2);
    } catch (error) {}
    const jwt = tryDecodeJWT(value);
    if (jwt) decoded += `\n\n[JWT]\nHeader: ${JSON.stringify(jwt.header)}\nPayload: ${JSON.stringify(jwt.payload)}`;
    if (decoded.length > 500) decoded = decoded.slice(0, 500) + "...";
    return decoded;
  }

  function computeRiskScore(cookies, currentDomain, weights) {
    if (cookies.length === 0) return 0;
    const week = Date.now() + ONE_WEEK;
    let totalRisk = 0;
    for (const cookie of cookies) {
      let risk = 0;
      if (cookie.domain.replace(/^\./, "") !== currentDomain) risk += weights.thirdParty;
      if (!cookie.secure) risk += weights.secure;
      if (!cookie.httpOnly) risk += weights.httpOnly;
      if (!cookie.sameSite || cookie.sameSite === "unspecified") risk += weights.sameSite;
      if (cookie.expirationDate && cookie.expirationDate * 1000 > week) risk += weights.expiration;
      if (trackers.some(t => cookie.domain.includes(t))) risk += weights.tracker;
      if (new Blob([cookie.value]).size > 1024) risk += 1;
      totalRisk += risk;
    }
    return Math.min(Math.round((totalRisk / cookies.length / 6) * 10), 10);
  }

  function getDataSharingExplanation(entry) {
    if (trackers.some(t => entry.domain.includes(t))) {
      return `Tracker (${trackers.find(t => entry.domain.includes(t))}) may share data.`;
    }
    return `May share with ${entry.domain}.`;
  }

  function showPopupNotification(message) {
    const notification = document.createElement("div");
    notification.className = "popup-notification";
    notification.textContent = message;
    document.body.appendChild(notification);
    requestAnimationFrame(() => { notification.style.opacity = "1"; });
    setTimeout(() => {
      notification.style.opacity = "0";
      setTimeout(() => notification.remove(), 300);
    }, 5000);
  }

  function addTrackingLog(entry) {
    const container = document.getElementById("tracking-list");
    if (!container) return;
    const div = document.createElement("div");
    div.className = "log-entry";
    div.innerHTML = `
      <strong>${entry.cookieName || entry.action}</strong> (${entry.domain || "N/A"})<br>
      <em>${entry.source} | ${new Date(entry.timestamp).toLocaleString()}</em><br>
      <strong>Value:</strong> <pre>${entry.value ? decodeCookieValue(entry.value, determineEncryptionMethod(entry.value)) : JSON.stringify(entry.data, null, 2)}</pre>
    `;
    const explanation = getDataSharingExplanation(entry);
    if (explanation) div.innerHTML += `<br><em>${explanation}</em>`;
    div.addEventListener("click", () => showDetailModal(entry));
    container.insertBefore(div, container.firstChild);
    container.scrollTop = 0;
  }

  function showBrowserNotification(entry) {
    chrome.storage.sync.get("notificationsEnabled", ({ notificationsEnabled = true }) => {
      if (notificationsEnabled) showPopupNotification(`Tracked: ${entry.cookieName || entry.action} (${entry.domain || "N/A"})`);
    });
  }

  function showDetailModal(entry) {
    const modalBody = document.getElementById("detail-modal-body");
    modalBody.innerHTML = `<pre>${JSON.stringify(entry, null, 2)}</pre>`;
    document.getElementById("detail-modal").style.display = "block";
  }

  // Event Listeners
  document.getElementById("detail-modal-close").addEventListener("click", () => {
    document.getElementById("detail-modal").style.display = "none";
  });

  window.addEventListener("click", event => {
    if (event.target === document.getElementById("detail-modal")) {
      document.getElementById("detail-modal").style.display = "none";
    }
  });

  document.getElementById("export-logs").addEventListener("click", () => {
    chrome.storage.local.get({ trackingLogs: [] }, ({ trackingLogs }) => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(trackingLogs).replace(/\s+/g, ' '));
      const downloadLink = document.createElement("a");
      downloadLink.setAttribute("href", dataStr);
      downloadLink.setAttribute("download", "tracking_logs_compressed.json");
      downloadLink.click();
    });
  });

  document.getElementById("export-pdf").addEventListener("click", () => {
    chrome.storage.local.get({ trackingLogs: [] }, ({ trackingLogs }) => {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      doc.setFontSize(12);
      let y = 10;
      doc.text("Tracking Logs", 10, y);
      y += 10;
      for (const log of trackingLogs) {
        const line = `${new Date(log.timestamp).toLocaleString()} | ${log.cookieName || log.action} @ ${log.domain || "N/A"} - ${log.source}`;
        doc.text(line, 10, y);
        y += 8;
        if (y > 280) {
          doc.addPage();
          y = 10;
        }
      }
      doc.save("tracking_logs.pdf");
    });
  });

  document.getElementById("clear-logs").addEventListener("click", () => {
    chrome.storage.local.set({ trackingLogs: [] }, () => {
      document.getElementById("tracking-list").innerHTML = `<p>${getLangString("noLogs")}</p>`;
      refreshCounters();
    });
  });

  document.getElementById("clear-history").addEventListener("click", () => {
    chrome.storage.sync.set({ historySessions: [] }, () => {
      document.getElementById("history-list").innerHTML = `<p>${getLangString("noHistory")}</p>`;
    });
  });

  document.getElementById("notifications-toggle").addEventListener("change", event => {
    chrome.storage.sync.set({ notificationsEnabled: event.target.checked });
  });

  document.getElementById("help-btn").addEventListener("click", () => {
    const helpInfo = document.getElementById("help-info");
    helpInfo.style.display = helpInfo.style.display === "block" ? "none" : "block";
  });

  document.getElementById("log-search").addEventListener("input", event => {
    const searchTerm = event.target.value.toLowerCase();
    const logEntries = document.querySelectorAll(".log-entry");
    for (const entry of logEntries) {
      entry.style.display = entry.innerText.toLowerCase().includes(searchTerm) ? "block" : "none";
    }
  });

  document.querySelectorAll(".tab-btn").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-panel").forEach(panel => {
        panel.style.display = panel.id === `${button.getAttribute("data-tab")}-panel` ? "block" : "none";
      });
      if (button.getAttribute("data-tab") === "risk") updateRiskAnalysis();
      if (button.getAttribute("data-tab") === "dashboard") loadChartJS(buildDashboard);
      if (button.getAttribute("data-tab") === "history") loadHistory();
      if (button.getAttribute("data-tab") === "device-info") showDeviceInfo();
    });
  });

  document.getElementById("remediate-cookies").addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs.length > 0) {
        const url = tabs[0].url;
        chrome.cookies.getAll({ url: url }, cookies => {
          let removedCount = 0;
          for (const cookie of cookies) {
            chrome.cookies.remove({ url: url, name: cookie.name }, () => removedCount++);
          }
          showPopupNotification(getLangString("remediateSuccess").replace("{count}", removedCount).replace("{url}", url));
        });
      }
    });
  });

  document.getElementById("block-high-risk").addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs.length > 0) {
        const url = tabs[0].url;
        chrome.cookies.getAll({ url: url }, cookies => {
          loadRiskWeights(weights => {
            const risk = computeRiskScore(cookies, new URL(url).hostname.replace(/^www\./, ""), weights);
            if (risk >= 8) {
              let removedCount = 0;
              for (const cookie of cookies) {
                chrome.cookies.remove({ url: url, name: cookie.name }, () => removedCount++);
              }
              showPopupNotification(`High-risk detected! Removed ${removedCount} cookies from ${url}.`);
            } else {
              showPopupNotification("Risk level below threshold for blocking.");
            }
          });
        });
      }
    });
  });

  document.getElementById("save-settings").addEventListener("click", () => {
    const weights = {
      thirdParty: parseFloat(document.getElementById("weight-third").value) || defaultWeights.thirdParty,
      secure: parseFloat(document.getElementById("weight-secure").value) || defaultWeights.secure,
      httpOnly: parseFloat(document.getElementById("weight-httponly").value) || defaultWeights.httpOnly,
      sameSite: parseFloat(document.getElementById("weight-samesite").value) || defaultWeights.sameSite,
      expiration: parseFloat(document.getElementById("weight-expiration").value) || defaultWeights.expiration,
      tracker: parseFloat(document.getElementById("weight-tracker").value) || defaultWeights.tracker
    };
    const whitelist = document.getElementById("whitelist").value;
    chrome.storage.sync.set({ riskWeights: weights, whitelist: whitelist }, () => {
      showPopupNotification(getLangString("settingsSaved"));
      location.reload();
    });
  });

  document.getElementById("badge-color").addEventListener("change", event => {
    chrome.storage.sync.set({ badgeColor: event.target.value });
  });

  document.getElementById("tracking-toggle").addEventListener("change", event => {
    chrome.storage.sync.set({ trackingActive: event.target.checked });
  });

  document.getElementById("update-tracker-list").addEventListener("click", () => {
    updateTrackerList();
    showPopupNotification("Tracker list updated.");
  });

  document.getElementById("theme-toggle").addEventListener("change", event => {
    const theme = event.target.checked ? "dark" : "light";
    chrome.storage.sync.set({ theme: theme });
    document.documentElement.setAttribute("data-theme", theme);
  });

  document.getElementById("language-toggle").addEventListener("change", event => {
    currentLanguage = event.target.value;
    location.reload();
  });

  document.getElementById("block-fingerprinting").addEventListener("change", event => {
    chrome.storage.sync.set({ blockFingerprinting: event.target.checked }, () => {
      if (event.target.checked) {
        HTMLCanvasElement.prototype.toDataURL = () => "blocked";
        showPopupNotification("Fingerprinting blocking enabled.");
      } else {
        delete HTMLCanvasElement.prototype.toDataURL;
        showPopupNotification("Fingerprinting blocking disabled.");
      }
    });
  });

  document.getElementById("clear-fingerprint").addEventListener("click", () => {
    chrome.storage.local.remove("deviceFingerprint", () => showPopupNotification("Fingerprint data cleared."));
  });

  // Core Functions
  function updateRiskAnalysis() {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs.length > 0) {
        const url = new URL(tabs[0].url);
        const domain = url.hostname.replace(/^www\./, "");
        chrome.storage.sync.get("riskWeights", ({ riskWeights = defaultWeights }) => {
          chrome.cookies.getAll({ url: tabs[0].url }, cookies => {
            const score = computeRiskScore(cookies, domain, riskWeights);
            const analysisContainer = document.getElementById("risk-analysis");
            const color = score < 4 ? "green" : score < 7 ? "orange" : "red";
            analysisContainer.innerHTML = `
              <h3 style="color:${color};">${getLangString("riskScoreLabel")}${score}/10</h3>
              <p>Based on ${cookies.length} cookie(s) from ${domain}.</p>
              <p>Factors: third-party, secure/HttpOnly flags, SameSite, expiration, known trackers, and size.</p>
            `;
            if (score > 7) showPopupNotification(getLangString("highRiskWarning"));
          });
        });
      }
    });
  }

  function buildDashboard() {
    if (typeof Chart === "undefined") {
      console.error("Chart.js is not available. Charts cannot be rendered.");
      return;
    }

    chrome.storage.local.get({ trackingLogs: [] }, ({ trackingLogs }) => {
      const hourlyRisk = {};
      const hourlyRemovals = {};
      for (const log of trackingLogs) {
        const hour = new Date(log.timestamp).toISOString().slice(0, 13) + ":00";
        if (!hourlyRisk[hour]) hourlyRisk[hour] = { total: 0, count: 0 };
        hourlyRisk[hour].total += 3;
        hourlyRisk[hour].count++;
        if (log.source === "onChanged") hourlyRemovals[hour] = (hourlyRemovals[hour] || 0) + 1;
      }
      const labels = Object.keys(hourlyRisk).sort();
      const riskData = labels.map(label => (hourlyRisk[label].total / hourlyRisk[label].count) || 0);
      const removalData = labels.map(label => hourlyRemovals[label] || 0);
      const ctx1 = document.getElementById("riskChart").getContext("2d");
      new Chart(ctx1, {
        type: "line",
        data: { labels: labels, datasets: [{ label: "Avg Risk", data: riskData, borderColor: "blue", backgroundColor: "rgba(0,0,255,0.1)" }] },
        options: { scales: { y: { beginAtZero: true, max: 10 } } }
      });
      const ctx2 = document.getElementById("removalChart").getContext("2d");
      new Chart(ctx2, {
        type: "bar",
        data: { labels: labels, datasets: [{ label: "Removals", data: removalData, backgroundColor: "rgba(255,0,0,0.5)" }] },
        options: { scales: { y: { beginAtZero: true } } }
      });
      chrome.storage.local.get(["deviceFingerprint", "trackingLogs"], ({ deviceFingerprint, trackingLogs }) => {
        const exposure = trackingLogs.filter(log => log.source.includes("tracking")).length;
        const uniqueness = deviceFingerprint ? Object.values(deviceFingerprint).filter(v => v !== "N/A" && v !== undefined).length / Object.keys(deviceFingerprint).length : 0;
        const ctx3 = document.getElementById("exposureChart").getContext("2d");
        new Chart(ctx3, {
          type: "doughnut",
          data: { labels: ["Tracked", "Untracked"], datasets: [{ data: [exposure, trackingLogs.length - exposure], backgroundColor: ["#ff6384", "#36a2eb"] }] },
          options: { title: { text: "Tracking Exposure" } }
        });
        const ctx4 = document.getElementById("uniquenessChart").getContext("2d");
        new Chart(ctx4, {
          type: "bar",
          data: { labels: ["Uniqueness"], datasets: [{ data: [uniqueness * 100], backgroundColor: "#4bc0c0" }] },
          options: { scales: { y: { max: 100 } }, title: { text: "Fingerprint Uniqueness (%)" } }
        });
      });
    });
  }

  function loadHistory() {
    const container = document.getElementById("history-list");
    container.innerHTML = "";
    chrome.storage.sync.get({ historySessions: [] }, ({ historySessions }) => {
      if (historySessions.length > 0) {
        for (const session of historySessions) {
          const div = document.createElement("div");
          div.className = "log-entry";
          const openTime = new Date(session.openTime).toLocaleString();
          const closeTime = session.closeTime ? new Date(session.closeTime).toLocaleString() : "Still Open";
          div.innerHTML = `<strong>${session.domain}</strong><br>Open: ${openTime}<br>Close: ${closeTime}<br>URL: ${session.url}`;
          div.addEventListener("click", () => {
            let detail = `URL: ${session.url}\nOpen: ${openTime}\nClose: ${closeTime}\n`;
            if (session.cookieSnapshot && session.cookieSnapshot.length > 0) {
              detail += "Cookie Snapshot:\n" + JSON.stringify(session.cookieSnapshot, null, 2);
            } else {
              detail += "No cookie snapshot available.";
            }
            showDetailModal({ session: detail });
          });
          container.appendChild(div);
        }
      } else {
        chrome.history.search({ text: "", startTime: Date.now() - ONE_WEEK, maxResults: 50 }, items => {
          if (items.length > 0) {
            for (const item of items) {
              const div = document.createElement("div");
              div.className = "log-entry";
              div.innerHTML = `<strong>${item.url}</strong><br>Last Visit: ${new Date(item.lastVisitTime).toLocaleString()}<br>Visits: ${item.visitCount}`;
              div.addEventListener("click", () => showDetailModal({ historyItem: JSON.stringify(item, null, 2) }));
              container.appendChild(div);
            }
          } else {
            container.innerHTML = `<p>${getLangString("noHistory")}</p>`;
          }
        });
      }
    });
  }

  function showDeviceInfo() {
    chrome.storage.local.get(["deviceFingerprint", "locationData", "dnsServers", "websiteDNS"], ({ deviceFingerprint, locationData, dnsServers, websiteDNS }) => {
      const infoElement = document.getElementById("device-info");
      infoElement.textContent = `Fingerprint:\n${deviceFingerprint ? JSON.stringify(deviceFingerprint, null, 2) : "No data"}\n\nLocation:\n${locationData ? JSON.stringify(locationData, null, 2) : "No data"}`;
      const dnsElement = document.getElementById("dns-servers");
      dnsElement.textContent = `User DNS Servers:\n${dnsServers || "No data"}\n\nWebsite DNS (approx):\n${websiteDNS || "No data"}`;
    });
  }

  function refreshCounters() {
    chrome.storage.local.get({ cookieCount: 0, trackerCount: 0 }, ({ cookieCount, trackerCount }) => {
      document.getElementById("cookie-counter").textContent = cookieCount;
      document.getElementById("tracker-counter").textContent = trackerCount;
    });
  }

  function loadRiskWeights(callback) {
    chrome.storage.sync.get({ riskWeights: defaultWeights }, ({ riskWeights }) => callback(riskWeights));
  }

  function loadLogs() {
    chrome.storage.local.get({ trackingLogs: [] }, ({ trackingLogs }) => {
      const container = document.getElementById("tracking-list");
      if (!container) return;
      container.innerHTML = trackingLogs.length > 0 ? "" : `<p>${getLangString("noLogs")}</p>`;
      trackingLogs.forEach(log => addTrackingLog(log));
    });
  }

  // Periodic Updates
  setInterval(() => {
    const activePanel = document.querySelector(".tab-panel[style*='display: block']");
    if (activePanel && activePanel.id === "risk-panel") {
      updateRiskAnalysis();
    }
  }, 60000);

  // Initialization
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs.length > 0) {
      const url = new URL(tabs[0].url);
      const domain = url.hostname.replace(/^www\./, "");
      const siteElement = document.createElement("p");
      siteElement.id = "current-website";
      siteElement.textContent = getLangString("siteLabel") + domain;
      document.getElementById("logs-panel").prepend(siteElement);
      chrome.cookies.getAll({ url: tabs[0].url }, cookies => {
        loadRiskWeights(weights => {
          const score = computeRiskScore(cookies, domain, weights);
          const riskText = document.createElement("p");
          riskText.style.fontWeight = "bold";
          riskText.textContent = getLangString("riskScoreLabel") + `${score}/10`;
          document.getElementById("logs-panel").prepend(riskText);
        });
      });
    }
  });

  loadLogs();

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs.length > 0) {
      chrome.cookies.getAll({ url: tabs[0].url }, cookies => {
        const container = document.getElementById("cookie-list");
        container.innerHTML = cookies.length > 0 ? cookies.map(cookie => `
          <div class="log-entry">
            <strong>${cookie.name}</strong> (${cookie.domain})<br>
            Expires: ${cookie.expirationDate ? new Date(cookie.expirationDate * 1000).toLocaleString() : "Session"}<br>
            <pre>${decodeCookieValue(cookie.value, determineEncryptionMethod(cookie.value))}</pre>
          </div>
        `).join("") : `<p>${getLangString("noCookies")}</p>`;
      });
    }
  });

  loadHistory();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "cookie_tracking") {
      console.log("Received cookie_tracking message in popup:", message.data);
      addTrackingLog(message.data);
      showBrowserNotification(message.data);
    } else if (message.type === "logs_updated") {
      console.log("Received logs_updated message in popup:", message.data);
      message.data.forEach(log => addTrackingLog(log));
    } else if (message.type === "canvas_fingerprint_detected") {
      showPopupNotification("Canvas fingerprinting detected on this site!");
    }
  });

  chrome.storage.sync.get("theme", ({ theme = "light" }) => {
    document.documentElement.setAttribute("data-theme", theme);
    document.getElementById("theme-toggle").checked = theme === "dark";
  });

  refreshCounters();

  // Stub for updateTrackerList
  function updateTrackerList() {
    console.log("updateTrackerList called, but functionality is not implemented.");
    // In a real implementation, this would fetch an updated list of trackers
  }
});