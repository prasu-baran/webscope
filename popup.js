const analyzeBtn = document.getElementById('analyzeBtn');
const output = document.getElementById('output');

analyzeBtn.addEventListener('click', async () => {
  output.textContent = 'Analyzing... Please wait...';

  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: analyzePage,
  }, (results) => {
    if (chrome.runtime.lastError || !results || !results[0]) {
      output.textContent = 'Failed to analyze the page.';
      return;
    }

    const data = results[0].result;
    output.innerHTML = formatOutput(data);

    // Call background script to analyze headers
    chrome.runtime.sendMessage(
      { type: "analyzeHeaders", url: tab.url },
      (headers) => {
        if (headers) {
          output.innerHTML += `<br><b>Security Headers:</b><ul>`;
          headers.forEach(h => {
            output.innerHTML += `<li>${h.name}: ${h.value}</li>`;
          });
          output.innerHTML += `</ul>`;
        } else {
          output.innerHTML += `<br><b>Security Headers:</b> ❌ Failed to fetch`;
        }
      }
    );
  });
});

function analyzePage() {
  const title = document.title;
  const scripts = Array.from(document.scripts).map(s => s.src || '[inline script]');
  const numScripts = scripts.length;

  const images = document.images;
  const numImages = images.length;

  const links = Array.from(document.links);
  const numLinks = links.length;

  const cssFiles = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href);
  const numCssFiles = cssFiles.length;

  const domElementsCount = document.getElementsByTagName('*').length;

  const frameworks = [];
  if (window.React) frameworks.push('React');
  if (window.angular) frameworks.push('Angular');
  if (window.Vue) frameworks.push('Vue.js');

  const loadTime = (performance.timing.loadEventEnd - performance.timing.navigationStart) / 1000;

  // SEO Tags
  const hasDescription = !!document.querySelector('meta[name="description"]');
  const hasRobots = !!document.querySelector('meta[name="robots"]');
  const hasOGTitle = !!document.querySelector('meta[property="og:title"]');
  const twitterCard = !!document.querySelector('meta[name="twitter:card"]');
  const canonicalLink = !!document.querySelector('link[rel="canonical"]');

  const usesAnalytics = Array.from(document.scripts).some(s => s.src.includes("google-analytics"));
  const usesTagManager = Array.from(document.scripts).some(s => s.src.includes("googletagmanager"));

  return {
    title,
    numScripts,
    scripts,
    numImages,
    numLinks,
    numCssFiles,
    domElementsCount,
    frameworks,
    loadTime: loadTime.toFixed(2),
    seo: {
      hasDescription,
      hasRobots,
      hasOGTitle,
      hasTwitterCard: twitterCard,
      hasCanonical: !!canonicalLink
    },
    tracking: {
      usesAnalytics,
      usesTagManager
    }
  };
}

function formatOutput(data) {
  return `
<b>Page Title:</b> ${escapeHtml(data.title)}<br>
<b>Page Load Time:</b> ${data.loadTime} seconds<br>
<b>Scripts (${data.numScripts}):</b> ${data.scripts.length > 0 ? `<ul>${data.scripts.map(src => `<li>${escapeHtml(src)}</li>`).join('')}</ul>` : 'None'}<br>
<b>Images:</b> ${data.numImages}<br>
<b>Links:</b> ${data.numLinks}<br>
<b>CSS Files:</b> ${data.numCssFiles}<br>
<b>DOM Elements:</b> ${data.domElementsCount}<br>
<b>Frameworks Detected:</b> ${data.frameworks.length > 0 ? data.frameworks.join(', ') : 'None'}<br><br>

<b>SEO Tags:</b><br>
- Meta Description: ${data.seo.hasDescription ? "✅ Present" : "❌ Missing"}<br>
- Robots Meta: ${data.seo.hasRobots ? "✅ Present" : "❌ Missing"}<br>
- OG Title: ${data.seo.hasOGTitle ? "✅ Present" : "❌ Missing"}<br>
- Twitter Card: ${data.seo.hasTwitterCard ? "✅ Present" : "❌ Missing"}<br>
- Canonical Link: ${data.seo.hasCanonical ? "✅ Present" : "❌ Missing"}<br><br>

<b>Tracking Tools:</b><br>
- Google Analytics: ${data.tracking.usesAnalytics ? "✅ Detected" : "❌ Not Found"}<br>
- Google Tag Manager: ${data.tracking.usesTagManager ? "✅ Detected" : "❌ Not Found"}<br>
  `;
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}
