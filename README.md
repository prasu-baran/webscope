# WebScope - Website Analyzer Chrome Extension

A Chrome Extension that analyzes any active web page and provides a detailed breakdown of its **performance, SEO, frameworks, tracking tools, security headers, DNS/SSL info, WHOIS data, and social media previews**.

---

## Features

### Page Analysis
- Title, DOM size, and page load time
- Scripts, images, CSS files, and link counts
- Framework detection: React, Angular, Vue.js, jQuery, Next.js, Nuxt.js

### SEO Analysis
- Meta description
- Robots tag
- OpenGraph title (`og:title`)
- Twitter card
- Canonical link

### Tracking Detection
- Google Analytics
- Google Tag Manager

### Security Headers Check
- Content-Security-Policy (CSP)
- X-Frame-Options
- Strict-Transport-Security (HSTS)
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy

### Network & External Checks
- **Redirect Chain** - Detects number of HTTP redirects via browser Navigation Timing API
- **DNS Lookup** - Queries Google DNS-over-HTTPS for A/CNAME records and status
- **SSL Certificate** - Fetches certificate details from crt.sh (subject, issuer, expiry, days remaining)
- **WHOIS / Domain Age** - Queries RDAP for domain registration date, expiry, and nameservers

### Social Preview
- **Facebook / Open Graph** - Visual card using `og:title`, `og:description`, `og:image`, `og:site_name`
- **Twitter / X** - Card preview respecting `twitter:card` type (summary or summary_large_image)
- **LinkedIn** - Preview card using OpenGraph tags

---

## Tech Stack
- HTML, CSS, JavaScript
- Chrome Extensions API (Manifest V3)
- Google DNS-over-HTTPS API
- crt.sh Certificate Transparency API
- RDAP (Registration Data Access Protocol)

---

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the `webscope` folder
6. The extension icon will appear in your Chrome toolbar

---

## Usage

1. Navigate to any website you want to analyze
2. Click the **WebScope** icon in the Chrome toolbar
3. Click **Analyze Current Page**
4. Results load in two phases:
   - **Instant**: Page info, SEO, tracking, and social preview (from the page DOM)
   - **Network checks**: DNS, SSL, WHOIS, and security headers load in parallel in the background

---

## Notes

- SSL info is sourced from Certificate Transparency logs via crt.sh and may reflect the most recently issued cert
- WHOIS data relies on RDAP; some TLDs (especially ccTLDs) may return limited or no data
- Security header checks use a HEAD request from the extension background worker — some servers block HEAD requests, which will show a fetch failure
