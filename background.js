chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'analyzeHeaders' && message.url) {
    fetchHeaders(message.url).then(sendResponse).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message.type === 'analyzeDNS' && message.url) {
    fetchDNS(message.url).then(sendResponse).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message.type === 'analyzeSSL' && message.url) {
    fetchSSL(message.url).then(sendResponse).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message.type === 'analyzeWHOIS' && message.url) {
    fetchWHOIS(message.url).then(sendResponse).catch(() => sendResponse({ ok: false }));
    return true;
  }
});

async function fetchHeaders(url) {
  const response = await fetch(url, { method: 'HEAD', mode: 'cors' });
  const headersToCheck = [
    'content-security-policy',
    'x-frame-options',
    'strict-transport-security',
    'x-content-type-options',
    'referrer-policy',
    'permissions-policy',
  ];
  const headers = headersToCheck.map(name => ({
    name,
    value: response.headers.get(name) || '❌ Not Present',
  }));
  return { ok: true, headers };
}

async function fetchDNS(url) {
  const hostname = new URL(url).hostname;
  const response = await fetch(
    `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`
  );
  const data = await response.json();
  return { ok: true, data };
}

async function fetchSSL(url) {
  const hostname = new URL(url).hostname;
  const response = await fetch(
    `https://crt.sh/?q=${encodeURIComponent(hostname)}&output=json`
  );
  const raw = await response.json();
  const certs = Array.isArray(raw) ? raw.slice(0, 200) : [];
  const now = Date.now();
  const valid = certs.filter(c => new Date(c.not_after).getTime() > now);
  const pool = valid.length > 0 ? valid : certs;
  const sorted = pool.sort((a, b) => new Date(b.not_after) - new Date(a.not_after));
  return { ok: true, cert: sorted[0] || null };
}

async function fetchWHOIS(url) {
  const hostname = new URL(url).hostname;
  // Strip subdomains to get the registrable domain (works for most TLDs)
  const parts = hostname.split('.');
  const domain = parts.slice(-2).join('.');
  const response = await fetch(
    `https://rdap.org/domain/${encodeURIComponent(domain)}`
  );
  const data = await response.json();
  return { ok: true, data };
}
