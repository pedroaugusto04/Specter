# Specter Companion — Web Session Sync Extension

**Specter Companion** is the companion extension enabling **Specter** scraping bots to access pages protected by authentication, two-factor authentication (2FA), and secure sessions without asking for passwords or manual DevTools inspection.

---

## How It Works

1. Sign in normally to the target site in your browser (e.g., LinkedIn, Amazon, internal portal).
2. Open the **Specter Companion** popup and click **" Sync Session with Specter"**.
3. The extension extracts cookies strictly for that active domain and sends them encrypted via HTTPS to your Specter account.
4. When your bots execute scheduled scrapes or AI schema compilation, they inherit the session and browse authenticated.

---

## 🛠️ Installation Guide (Chrome / Brave / Edge)

1. Open your browser and navigate to:
   - **Chrome**: `chrome://extensions`
   - **Brave**: `brave://extensions`
   - **Edge**: `edge://extensions`
2. In the top-right corner, toggle **Developer mode** to ON.
3. Click **"Load unpacked"**.
4. Select the **`extension`** folder from the repository:
   ```
   path/to/Specter/extension
   ```
5. Pin the Specter icon to your browser toolbar for quick access.

---

## Security & Privacy Guarantees

- **Domain Isolation:** The extension strictly queries `chrome.cookies.getAll({ domain: activeTabHostname })`. It **never** scans, reads, or transmits cookies from other websites or open tabs.
- **Zero Credentials:** Passwords, credit cards, and MFA secrets are never accessed or stored.
- **User-Initiated Only:** Data is sent only when the user explicitly clicks the sync button.
- **Revocable:** Logging out of the target website or clearing browser cookies instantly invalidates the session in Specter.
