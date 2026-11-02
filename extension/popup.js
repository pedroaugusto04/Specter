// Specter Companion - Browser Extension Script
const DEFAULT_API_URL = 'https://specterdev.online';

// DOM Elements
const authSection = document.getElementById('auth-section');
const userInfoSection = document.getElementById('user-info-section');
const syncSection = document.getElementById('sync-section');
const systemTabWarning = document.getElementById('system-tab-warning');

const connBadge = document.getElementById('conn-badge');
const backendUrlInput = document.getElementById('backend-url');
const toggleServerConfig = document.getElementById('toggle-server-config');
const customServerGroup = document.getElementById('custom-server-group');

const btnGoogle = document.getElementById('btn-google');
const emailInput = document.getElementById('auth-email');
const passwordInput = document.getElementById('auth-password');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const userEmailDisplay = document.getElementById('user-email-display');

const tabDomainDisplay = document.getElementById('tab-domain');
const tabCookiesCountDisplay = document.getElementById('tab-cookies-count');
const sessionNameInput = document.getElementById('session-name');
const syncAlert = document.getElementById('sync-alert');
const btnSync = document.getElementById('btn-sync');
const linkDashboard = document.getElementById('link-dashboard');

let currentTab = null;
let activeCookies = [];
let currentApiUrl = DEFAULT_API_URL;
let currentToken = null;

// Toggle optional custom server input
if (toggleServerConfig && customServerGroup) {
  toggleServerConfig.addEventListener('click', (e) => {
    e.preventDefault();
    customServerGroup.classList.toggle('hidden');
  });
}

// Helper to show status alert
function showAlert(message, type = 'info') {
  syncAlert.className = `status-alert ${type}`;
  syncAlert.textContent = message;
  syncAlert.style.display = 'block';
}

function hideAlert() {
  syncAlert.style.display = 'none';
  syncAlert.textContent = '';
}

// Storage Helpers
async function loadStoredConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiUrl', 'token', 'userEmail'], (res) => {
      resolve(res || {});
    });
  });
}

async function saveStoredConfig(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, resolve);
  });
}

async function clearStoredConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(['token', 'userEmail'], resolve);
  });
}

// Verify Token or Session with Backend
async function verifySession(apiUrl, token) {
  try {
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${apiUrl}/api/auth/me`, {
      headers,
      credentials: 'include',
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data;
  } catch (err) {
    console.error('Error verifying session:', err);
    return null;
  }
}

// Try auto-detecting an existing active browser session on the Specter website
async function tryAutoConnectSpecterSession(apiUrl) {
  try {
    const cookie = await chrome.cookies.get({ url: apiUrl, name: 'specter_access' });
    if (cookie && cookie.value) {
      const user = await verifySession(apiUrl, cookie.value);
      if (user) {
        await saveStoredConfig({
          apiUrl,
          token: cookie.value,
          userEmail: user.email,
        });
        return { user, token: cookie.value };
      }
    }
  } catch (e) {
    console.debug('No active web cookie found for Specter:', e);
  }
  return null;
}

// Extract cookies ONLY for the active tab's domain
async function extractActiveTabCookies(tab) {
  if (!tab || !tab.url) return [];

  let urlObj;
  try {
    urlObj = new URL(tab.url);
  } catch {
    return [];
  }

  // Skip browser internal pages
  if (
    urlObj.protocol === 'chrome:' ||
    urlObj.protocol === 'chrome-extension:' ||
    urlObj.protocol === 'about:' ||
    urlObj.protocol === 'edge:'
  ) {
    return [];
  }

  const hostname = urlObj.hostname;

  // Query ONLY for the current URL and exact hostname
  const [urlCookies, domainCookies] = await Promise.all([
    chrome.cookies.getAll({ url: tab.url }),
    chrome.cookies.getAll({ domain: hostname }),
  ]);

  const map = new Map();
  for (const c of [...urlCookies, ...domainCookies]) {
    const key = `${c.name}@${c.domain}${c.path}`;
    if (!map.has(key)) {
      map.set(key, c);
    }
  }

  return Array.from(map.values());
}

// Check if domain is already registered on Specter
async function checkExistingSession(apiUrl, token, domain) {
  try {
    const res = await fetch(`${apiUrl}/api/sessions/check?domain=${encodeURIComponent(domain)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.hasSession ? json.data.session : null;
  } catch {
    return null;
  }
}

// Initialize View State
async function init() {
  const config = await loadStoredConfig();
  currentApiUrl = config.apiUrl || DEFAULT_API_URL;
  if (backendUrlInput) {
    backendUrlInput.value = currentApiUrl;
  }
  currentToken = config.token;

  let authenticatedUser = null;

  // 1. Check stored token
  if (currentToken) {
    authenticatedUser = await verifySession(currentApiUrl, currentToken);
  }

  // 2. If no valid stored token, check if user is already logged in on Specter's web app!
  if (!authenticatedUser) {
    const autoConn = await tryAutoConnectSpecterSession(currentApiUrl);
    if (autoConn) {
      authenticatedUser = autoConn.user;
      currentToken = autoConn.token;
    }
  }

  if (authenticatedUser) {
    renderConnected(authenticatedUser.email);
  } else {
    renderDisconnected();
  }

  // Load Active Tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  if (authenticatedUser) {
    await setupActiveTab(tab);
  }
}

function renderConnected(email) {
  connBadge.textContent = '🟢 Connected';
  connBadge.className = 'badge connected';
  userEmailDisplay.textContent = email;

  authSection.classList.add('hidden');
  userInfoSection.classList.remove('hidden');
  syncSection.classList.remove('hidden');
}

function renderDisconnected() {
  connBadge.textContent = 'Disconnected';
  connBadge.className = 'badge';

  authSection.classList.remove('hidden');
  userInfoSection.classList.add('hidden');
  syncSection.classList.add('hidden');
  systemTabWarning.classList.add('hidden');
}

async function setupActiveTab(tab) {
  if (!tab || !tab.url) {
    syncSection.classList.add('hidden');
    systemTabWarning.classList.remove('hidden');
    return;
  }

  let urlObj;
  try {
    urlObj = new URL(tab.url);
  } catch {
    syncSection.classList.add('hidden');
    systemTabWarning.classList.remove('hidden');
    return;
  }

  // Ignore internal/dashboard tabs
  if (
    urlObj.protocol === 'chrome:' ||
    urlObj.protocol === 'chrome-extension:' ||
    urlObj.protocol === 'about:' ||
    urlObj.protocol === 'edge:' ||
    tab.url.includes('specterdev.online') ||
    tab.url.includes('localhost:3000') ||
    tab.url.includes('localhost:3001')
  ) {
    syncSection.classList.add('hidden');
    systemTabWarning.classList.remove('hidden');
    return;
  }

  systemTabWarning.classList.add('hidden');
  syncSection.classList.remove('hidden');

  tabDomainDisplay.textContent = urlObj.hostname;
  sessionNameInput.value = urlObj.hostname;

  activeCookies = await extractActiveTabCookies(tab);
  tabCookiesCountDisplay.textContent = `${activeCookies.length} cookies detected for this domain`;

  if (activeCookies.length === 0) {
    showAlert('No cookies found on this page. Make sure you are signed in.', 'info');
  } else {
    // Check if Specter already has this session saved
    const existing = await checkExistingSession(currentApiUrl, currentToken, urlObj.hostname);
    if (existing) {
      showAlert(`✅ Active session saved (${existing.cookieCount} cookies). Click below to update.`, 'success');
      btnSync.innerHTML = '<span> Update Session in Specter</span>';
    } else {
      hideAlert();
      btnSync.innerHTML = '<span> Sync Session with Specter</span>';
    }
  }
}

// Google OAuth Handler
if (btnGoogle) {
  btnGoogle.addEventListener('click', async () => {
    const rawApiUrl = backendUrlInput ? backendUrlInput.value.trim() : '';
    const apiUrl = (rawApiUrl || DEFAULT_API_URL).replace(/\/$/, '');

    btnGoogle.disabled = true;
    btnGoogle.innerHTML = '<span class="spinner"></span> <span>Opening Google Sign-In...</span>';

    try {
      // Open Google OAuth flow in a new browser tab
      const authTab = await chrome.tabs.create({ url: `${apiUrl}/api/auth/google` });

      // Listen for the tab redirecting back to Specter once OAuth finishes
      const checkCompletion = async (tabId, changeInfo, updatedTab) => {
        if (tabId === authTab.id && changeInfo.status === 'complete' && updatedTab.url) {
          if (
            updatedTab.url.includes('specterdev.online') ||
            updatedTab.url.includes('localhost:3000') ||
            updatedTab.url.includes('/api/auth/google/callback')
          ) {
            // Attempt retrieving authentication cookie
            setTimeout(async () => {
              const cookie = await chrome.cookies.get({ url: apiUrl, name: 'specter_access' });
              if (cookie && cookie.value) {
                const user = await verifySession(apiUrl, cookie.value);
                if (user) {
                  await saveStoredConfig({
                    apiUrl,
                    token: cookie.value,
                    userEmail: user.email,
                  });
                  currentApiUrl = apiUrl;
                  currentToken = cookie.value;

                  chrome.tabs.onUpdated.removeListener(checkCompletion);
                  chrome.tabs.remove(tabId).catch(() => {});

                  renderConnected(user.email);
                  if (currentTab) await setupActiveTab(currentTab);
                }
              }
            }, 600);
          }
        }
      };

      chrome.tabs.onUpdated.addListener(checkCompletion);
    } catch (err) {
      alert(`Could not start Google Sign-In: ${err.message}`);
    } finally {
      setTimeout(() => {
        btnGoogle.disabled = false;
        btnGoogle.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span>Continue with Google</span>
        `;
      }, 1500);
    }
  });
}

// Login Event Handler
btnLogin.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const rawApiUrl = backendUrlInput ? backendUrlInput.value.trim() : '';
  const apiUrl = (rawApiUrl || DEFAULT_API_URL).replace(/\/$/, '');

  if (!email || !password) {
    alert('Please enter your email and password registered on Specter.');
    return;
  }

  btnLogin.disabled = true;
  btnLogin.innerHTML = '<span class="spinner"></span> <span>Signing in...</span>';

  try {
    const res = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const json = await res.json();

    if (!res.ok) {
      alert(json.message || 'Failed to authenticate on Specter.');
      btnLogin.disabled = false;
      btnLogin.innerHTML = '<span>Sign In with Email</span>';
      return;
    }

    const token = json.token || json.tokens?.accessToken;
    const userEmail = json.data?.email || email;

    await saveStoredConfig({
      apiUrl,
      token,
      userEmail,
    });

    currentApiUrl = apiUrl;
    currentToken = token;

    renderConnected(userEmail);
    if (currentTab) {
      await setupActiveTab(currentTab);
    }
  } catch (err) {
    alert(`Connection error with Specter server (${apiUrl}): ${err.message}`);
  } finally {
    btnLogin.disabled = false;
    btnLogin.innerHTML = '<span>Sign In with Email</span>';
  }
});

// Logout Event Handler
btnLogout.addEventListener('click', async (e) => {
  e.preventDefault();
  await clearStoredConfig();
  currentToken = null;
  renderDisconnected();
});

// Sync Event Handler
btnSync.addEventListener('click', async () => {
  if (!currentTab || !currentTab.url) return;
  if (!currentToken) {
    showAlert('You need to be signed in to Specter to sync.', 'error');
    return;
  }

  const urlObj = new URL(currentTab.url);
  const domain = urlObj.hostname;
  const name = sessionNameInput.value.trim() || domain;

  btnSync.disabled = true;
  btnSync.innerHTML = '<span class="spinner"></span> <span>Syncing...</span>';

  try {
    // Re-extract cookies strictly for the active tab domain
    activeCookies = await extractActiveTabCookies(currentTab);

    if (activeCookies.length === 0) {
      showAlert('No session cookies found for this domain.', 'error');
      btnSync.disabled = false;
      btnSync.innerHTML = '<span> Sync Session with Specter</span>';
      return;
    }

    const payload = {
      domain,
      name,
      cookies: activeCookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expirationDate,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      })),
    };

    const res = await fetch(`${currentApiUrl}/api/sessions/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentToken}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();

    if (!res.ok) {
      showAlert(json.message || 'Error syncing session.', 'error');
    } else {
      showAlert(` Session synced successfully! (${activeCookies.length} cookies). Specter will now browse authenticated on this site.`, 'success');
      btnSync.innerHTML = '<span> Update Session in Specter</span>';
    }
  } catch (err) {
    showAlert(`Network error: ${err.message}`, 'error');
  } finally {
    btnSync.disabled = false;
  }
});

// Dashboard link handler
linkDashboard.addEventListener('click', (e) => {
  e.preventDefault();
  const dashboardUrl = currentApiUrl.includes('localhost') ? 'http://localhost:3000' : 'https://specterdev.online';
  chrome.tabs.create({ url: dashboardUrl });
});

// Start initialization
init();
