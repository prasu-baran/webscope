const analyzeBtn = document.getElementById('analyzeBtn');
const output = document.getElementById('output');

function sendBgMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => resolve(resp ?? null));
  });
}

analyzeBtn.addEventListener('click', async () => {
  output.innerHTML = '<div style="color:#7f8c8d;text-align:center;padding:12px"><i>Analyzing page...</i></div>';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const results = await new Promise((resolve) => {
    chrome.scripting.executeScript(
      { target: { tabId: tab.id }, function: analyzePage },
      resolve
    );
  });

  if (chrome.runtime.lastError || !results?.[0]?.result) {
    output.innerHTML = '<span style="color:#e74c3c">Failed to analyze this page.</span>';
    return;
  }

  const data = results[0].result;

  // Show page analysis + social preview immediately (no network needed)
  output.innerHTML = formatPageSection(data) + formatSocialPreview(data.social, data.hostname);

  // Append a placeholder for network results
  const netDiv = document.createElement('div');
  netDiv.innerHTML = `
    <div class="section-header">&#127760; Network &amp; External Checks</div>
    <div class="info-row" style="color:#7f8c8d"><i>Running DNS, SSL &amp; WHOIS checks...</i></div>
  `;
  output.appendChild(netDiv);

  // All four background checks fire in parallel
  const [headers, dns, ssl, whois] = await Promise.all([
    sendBgMessage({ type: 'analyzeHeaders', url: tab.url }),
    sendBgMessage({ type: 'analyzeDNS',     url: tab.url }),
    sendBgMessage({ type: 'analyzeSSL',     url: tab.url }),
    sendBgMessage({ type: 'analyzeWHOIS',   url: tab.url }),
  ]);

  netDiv.innerHTML = formatNetworkSection(data.redirectCount, headers, dns, ssl, whois);
});

// ---------------------------------------------------------------------------
// analyzePage() — injected into the active tab, runs in page context
// ---------------------------------------------------------------------------
function analyzePage() {
  const title = document.title;
  const scripts = Array.from(document.scripts).map(s => s.src || '[inline]');
  const numImages = document.images.length;
  const numLinks = document.links.length;
  const numCssFiles = document.querySelectorAll('link[rel="stylesheet"]').length;
  const domElementsCount = document.getElementsByTagName('*').length;

  const frameworks = [];
  if (window.React) frameworks.push('React');
  if (window.angular) frameworks.push('Angular');
  if (window.Vue) frameworks.push('Vue.js');
  if (window.jQuery || window.$?.fn?.jquery) frameworks.push('jQuery');
  if (window.__NEXT_DATA__) frameworks.push('Next.js');
  if (window.__nuxt__) frameworks.push('Nuxt.js');

  const t = performance.timing;
  const loadTime = t.loadEventEnd > 0
    ? ((t.loadEventEnd - t.navigationStart) / 1000).toFixed(2)
    : 'N/A';

  const seo = {
    hasDescription:  !!document.querySelector('meta[name="description"]'),
    hasRobots:       !!document.querySelector('meta[name="robots"]'),
    hasOGTitle:      !!document.querySelector('meta[property="og:title"]'),
    hasTwitterCard:  !!document.querySelector('meta[name="twitter:card"]'),
    hasCanonical:    !!document.querySelector('link[rel="canonical"]'),
  };

  const tracking = {
    usesAnalytics:   scripts.some(s => s.includes('google-analytics')),
    usesTagManager:  scripts.some(s => s.includes('googletagmanager')),
  };

  const navEntry = performance.getEntriesByType('navigation')[0];
  const redirectCount = navEntry ? navEntry.redirectCount : 0;

  // Social / OG tag extraction
  const meta = (sel) => document.querySelector(sel)?.content || '';
  const resolveUrl = (url) => {
    if (!url) return '';
    try { return new URL(url, window.location.href).href; } catch { return url; }
  };

  const ogTitle  = meta('meta[property="og:title"]') || document.title;
  const ogImage  = resolveUrl(meta('meta[property="og:image"]'));
  const twImage  = resolveUrl(meta('meta[name="twitter:image"]')) || ogImage;

  const social = {
    og: {
      title:       ogTitle,
      description: meta('meta[property="og:description"]'),
      image:       ogImage,
      url:         meta('meta[property="og:url"]') || window.location.href,
      siteName:    meta('meta[property="og:site_name"]'),
    },
    twitter: {
      card:        meta('meta[name="twitter:card"]') || 'summary',
      title:       meta('meta[name="twitter:title"]') || ogTitle,
      description: meta('meta[name="twitter:description"]') || meta('meta[property="og:description"]'),
      image:       twImage,
      site:        meta('meta[name="twitter:site"]'),
    },
  };

  return {
    title,
    scripts,
    numScripts: scripts.length,
    numImages,
    numLinks,
    numCssFiles,
    domElementsCount,
    frameworks,
    loadTime,
    seo,
    tracking,
    redirectCount,
    social,
    hostname: window.location.hostname,
  };
}

// ---------------------------------------------------------------------------
// formatPageSection — instant results from DOM
// ---------------------------------------------------------------------------
function formatPageSection(data) {
  const flag = (v) => v ? '&#9989;' : '&#10060;';
  return `
<div class="section-header">&#128203; Page Info</div>
<div class="info-row"><b>Title:</b> ${escapeHtml(data.title)}</div>
<div class="info-row"><b>Load Time:</b> ${data.loadTime}s &nbsp;|&nbsp; <b>DOM Elements:</b> ${data.domElementsCount}</div>
<div class="info-row"><b>Scripts:</b> ${data.numScripts} &nbsp;|&nbsp; <b>Images:</b> ${data.numImages} &nbsp;|&nbsp; <b>Links:</b> ${data.numLinks} &nbsp;|&nbsp; <b>CSS:</b> ${data.numCssFiles}</div>
<div class="info-row"><b>Frameworks:</b> ${data.frameworks.length ? escapeHtml(data.frameworks.join(', ')) : 'None detected'}</div>

<div class="section-header">&#128200; SEO</div>
<div class="info-row">${flag(data.seo.hasDescription)} Meta Description &nbsp; ${flag(data.seo.hasRobots)} Robots &nbsp; ${flag(data.seo.hasOGTitle)} OG Title</div>
<div class="info-row">${flag(data.seo.hasTwitterCard)} Twitter Card &nbsp; ${flag(data.seo.hasCanonical)} Canonical Link</div>

<div class="section-header">&#128295; Tracking</div>
<div class="info-row">${flag(data.tracking.usesAnalytics)} Google Analytics &nbsp;|&nbsp; ${flag(data.tracking.usesTagManager)} Tag Manager</div>
`;
}

// ---------------------------------------------------------------------------
// formatNetworkSection — async results from background.js
// ---------------------------------------------------------------------------
function formatNetworkSection(redirectCount, headers, dns, ssl, whois) {
  let html = '<div class="section-header">&#127760; Network &amp; External Checks</div>';

  // Redirect chain
  html += `<div class="info-row"><b>Redirects:</b> ${
    redirectCount === 0
      ? '<span class="badge-ok">&#9989; Direct (0 redirects)</span>'
      : `<span class="badge-warn">&#9888; ${redirectCount} redirect(s) detected</span>`
  }</div>`;

  // DNS
  html += '<div class="section-header">&#128269; DNS Lookup</div>';
  if (dns?.ok && dns.data) {
    const ok = dns.data.Status === 0;
    html += `<div class="info-row"><b>Status:</b> ${
      ok
        ? '<span class="badge-ok">&#9989; NOERROR</span>'
        : `<span class="badge-err">&#10060; Code ${dns.data.Status}</span>`
    }</div>`;
    const aRecs = (dns.data.Answer || []).filter(r => r.type === 1).map(r => r.data);
    if (aRecs.length) {
      html += `<div class="info-row"><b>IP Address(es):</b> ${escapeHtml(aRecs.slice(0, 4).join(', '))}</div>`;
    }
    const cnames = (dns.data.Answer || []).filter(r => r.type === 5).map(r => r.data);
    if (cnames.length) {
      html += `<div class="info-row"><b>CNAME:</b> ${escapeHtml(cnames[0])}</div>`;
    }
  } else {
    html += '<div class="info-row"><span class="badge-err">&#10060; DNS lookup failed</span></div>';
  }

  // SSL Certificate
  html += '<div class="section-header">&#128272; SSL Certificate</div>';
  if (ssl?.ok && ssl.cert) {
    const cert = ssl.cert;
    const expiry = new Date(cert.not_after);
    const daysLeft = Math.floor((expiry - Date.now()) / 86400000);
    const expiryBadge = daysLeft > 30
      ? `<span class="badge-ok">&#9989; Valid &mdash; ${daysLeft} days left</span>`
      : daysLeft > 0
        ? `<span class="badge-warn">&#9888; Expiring soon &mdash; ${daysLeft} days</span>`
        : '<span class="badge-err">&#10060; EXPIRED</span>';
    // Clean up issuer string: grab O= value if present
    const rawIssuer = cert.issuer_name || 'N/A';
    const issuerMatch = rawIssuer.match(/O=([^,]+)/);
    const issuer = issuerMatch ? issuerMatch[1].trim() : rawIssuer;

    html += `<div class="info-row"><b>Subject:</b> ${escapeHtml(cert.common_name || cert.name_value || 'N/A')}</div>`;
    html += `<div class="info-row"><b>Issuer:</b> ${escapeHtml(issuer)}</div>`;
    html += `<div class="info-row"><b>Valid:</b> ${new Date(cert.not_before).toLocaleDateString()} &rarr; ${expiry.toLocaleDateString()}</div>`;
    html += `<div class="info-row">${expiryBadge}</div>`;
  } else {
    html += '<div class="info-row"><span class="badge-err">&#10060; Could not retrieve SSL info</span></div>';
  }

  // WHOIS / Domain
  html += '<div class="section-header">&#128203; Domain / WHOIS</div>';
  if (whois?.ok && whois.data) {
    const events = whois.data.events || [];
    const find = (action) => events.find(e => e.eventAction === action);
    const regEv = find('registration');
    const expEv = find('expiration');

    if (regEv) {
      const regDate = new Date(regEv.eventDate);
      const ageYears = ((Date.now() - regDate) / (365.25 * 86400000)).toFixed(1);
      html += `<div class="info-row"><b>Registered:</b> ${regDate.toLocaleDateString()} <span class="muted">(${ageYears} years old)</span></div>`;
    }
    if (expEv) {
      const expDate = new Date(expEv.eventDate);
      const daysLeft = Math.floor((expDate - Date.now()) / 86400000);
      html += `<div class="info-row"><b>Domain Expires:</b> ${expDate.toLocaleDateString()} <span class="muted">(${daysLeft > 0 ? daysLeft + ' days' : 'EXPIRED'})</span></div>`;
    }
    if (whois.data.nameservers?.length) {
      const ns = whois.data.nameservers
        .map(n => escapeHtml(n.ldhName || n.unicodeName || ''))
        .filter(Boolean)
        .slice(0, 3)
        .join(', ');
      html += `<div class="info-row"><b>Nameservers:</b> ${ns}</div>`;
    }
    if (!regEv && !expEv) {
      html += '<div class="info-row"><span class="badge-warn">&#9888; Limited WHOIS data available for this TLD</span></div>';
    }
  } else {
    html += '<div class="info-row"><span class="badge-err">&#10060; WHOIS lookup failed</span></div>';
  }

  // Security Headers
  html += '<div class="section-header">&#128274; Security Headers</div>';
  if (headers?.ok && headers.headers) {
    html += '<ul class="headers-list">';
    headers.headers.forEach(h => {
      const present = h.value !== '❌ Not Present';
      const shortVal = present
        ? escapeHtml(h.value.length > 40 ? h.value.substring(0, 40) + '&hellip;' : h.value)
        : '';
      html += `<li class="info-row">
        <span class="${present ? 'badge-ok' : 'badge-err'}">${present ? '&#9989;' : '&#10060;'}</span>
        <span class="header-name">${escapeHtml(h.name)}</span>
        ${present ? `<span class="header-val">${shortVal}</span>` : '<span class="badge-err"> Missing</span>'}
      </li>`;
    });
    html += '</ul>';
  } else {
    html += '<div class="info-row"><span class="badge-err">&#10060; Failed to fetch headers</span></div>';
  }

  return html;
}

// ---------------------------------------------------------------------------
// formatSocialPreview — renders OG/Twitter/LinkedIn preview cards
// ---------------------------------------------------------------------------
function formatSocialPreview(social, hostname) {
  if (!social) return '';

  let html = '<div class="section-header">&#128065; Social Preview</div>';

  // --- Facebook / Open Graph ---
  html += '<div class="platform-label platform-fb">Facebook / Open Graph</div>';
  html += '<div class="og-card">';
  if (social.og.image) {
    html += `<img class="card-image" src="${escapeHtml(social.og.image)}" alt="" onerror="this.style.display='none'">`;
  } else {
    html += '<div class="img-placeholder">No og:image set</div>';
  }
  html += '<div class="card-body">';
  if (social.og.siteName) {
    html += `<div class="card-site">${escapeHtml(social.og.siteName.toUpperCase())}</div>`;
  }
  html += `<div class="card-title">${escapeHtml(social.og.title || 'No title')}</div>`;
  if (social.og.description) {
    html += `<div class="card-desc">${escapeHtml(social.og.description)}</div>`;
  }
  html += '</div></div>';

  // --- Twitter / X ---
  html += '<div class="platform-label platform-tw">Twitter / X</div>';
  const isLarge = social.twitter.card === 'summary_large_image';

  if (isLarge) {
    // Large image card
    html += '<div class="og-card">';
    if (social.twitter.image) {
      html += `<img class="card-image" src="${escapeHtml(social.twitter.image)}" alt="" onerror="this.style.display='none'">`;
    } else {
      html += '<div class="img-placeholder" style="background:#eff3f4">No twitter:image set</div>';
    }
    html += '<div class="card-body">';
    html += `<div class="card-title">${escapeHtml(social.twitter.title || 'No title')}</div>`;
    if (social.twitter.description) {
      html += `<div class="card-desc">${escapeHtml(social.twitter.description)}</div>`;
    }
    if (social.twitter.site) {
      html += `<div class="card-site">${escapeHtml(social.twitter.site)}</div>`;
    }
    html += '</div></div>';
  } else {
    // Summary card (thumbnail left, text right)
    html += '<div class="tw-summary-card">';
    if (social.twitter.image) {
      html += `<img class="tw-thumb" src="${escapeHtml(social.twitter.image)}" alt="" onerror="this.style.display='none'">`;
    } else {
      html += '<div class="tw-thumb-placeholder">No image</div>';
    }
    html += '<div class="card-body">';
    html += `<div class="card-title">${escapeHtml(social.twitter.title || 'No title')}</div>`;
    if (social.twitter.description) {
      html += `<div class="card-desc">${escapeHtml(social.twitter.description)}</div>`;
    }
    if (social.twitter.site) {
      html += `<div class="card-site">${escapeHtml(social.twitter.site)}</div>`;
    }
    html += '</div></div>';
  }

  // --- LinkedIn (uses OG tags) ---
  html += '<div class="platform-label platform-li">LinkedIn</div>';
  html += '<div class="li-card">';
  if (social.og.image) {
    html += `<img class="card-image" src="${escapeHtml(social.og.image)}" alt="" onerror="this.style.display='none'">`;
  } else {
    html += '<div class="img-placeholder" style="height:55px">No og:image set</div>';
  }
  html += '<div class="card-body li-body">';
  html += `<div class="card-title">${escapeHtml(social.og.title || 'No title')}</div>`;
  html += `<div class="card-site">${escapeHtml(hostname || '')}</div>`;
  html += '</div></div>';

  return html;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeHtml(text) {
  if (text == null) return '';
  return String(text).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[m]);
}
