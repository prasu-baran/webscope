chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.type === "analyzeHeaders" && message.url) {
      try {
        const response = await fetch(message.url, { method: "HEAD", mode: "cors" });
  
        const headersToCheck = [
          "content-security-policy",
          "x-frame-options",
          "strict-transport-security",
          "x-content-type-options",
          "referrer-policy",
          "permissions-policy"
        ];
  
        const headers = headersToCheck.map(name => {
          const value = response.headers.get(name);
          return { name, value: value || "❌ Not Present" };
        });
  
        sendResponse(headers);
      } catch (err) {
        console.error("Header fetch failed:", err);
        sendResponse(null);
      }
  
      return true; // Required for async sendResponse
    }
  });
  