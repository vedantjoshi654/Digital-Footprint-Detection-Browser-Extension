// dataEncryption.js
async function encryptData(data, method = "AES") {
  try {
    const encoded = btoa(data);
    const logs = JSON.parse(localStorage.getItem("encryptionLogs") || "[]");
    logs.push({ method: method, timestamp: Date.now() });
    localStorage.setItem("encryptionLogs", JSON.stringify(logs));
    return encoded;
  } catch (error) {
    console.error("Encryption error:", error);
    return data; // Fallback to original data
  }
}