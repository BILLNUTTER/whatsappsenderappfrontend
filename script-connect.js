const API_URL =
  `${window.location.protocol}//${window.location.hostname}:3000`;

const POLL_INTERVAL_MS = 2500;

let pollInterval = null;
let isCheckingConnection = false;
let isStarting = false;
let isFetchingQR = false;
let redirected = false;
let startRequested = false;
let lastRenderedQR = null;

// ---------- Page initialization ----------

document.addEventListener("DOMContentLoaded", initializeConnectPage);
window.addEventListener("pagehide", stopPolling);

function initializeConnectPage() {
  const addButton = document.getElementById("add-instance-button");
  const refreshButton = document.getElementById("refresh-status-button");
  const dashboardButton = document.getElementById("dashboard-button");

  addButton?.addEventListener("click", getQR);
  refreshButton?.addEventListener("click", handleRefresh);

  dashboardButton?.addEventListener("click", () => {
    window.location.href = "dashboard.html";
  });

  console.log("Connect page initialized.");
  console.log("Backend API:", API_URL);

  // QR rendering is handled by the backend-generated image data URL.
  refreshConnection();
}

// ---------- API requests ----------

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    redirectToLogin();
    return null;
  }

  if (!response.ok) {
    // A 404 from the QR endpoint means the QR may not be ready yet.
    if (path === "/api/whatsapp-qr" && response.status === 404) {
      return null;
    }

    throw new Error(
      data.message ||
      data.error ||
      `Request failed with HTTP ${response.status}.`
    );
  }

  return data;
}

async function getStatus() {
  return apiRequest("/status");
}

// ---------- Add / Link WhatsApp ----------

async function getQR() {
  if (isStarting || redirected) return;

  isStarting = true;
  startRequested = true;

  const button = getAddButton();

  if (button) {
    button.disabled = true;
    button.textContent = "Starting WhatsApp...";
  }

  clearError();
  setMessage("Checking WhatsApp connection...");
  setQRStatus("Waiting for a QR code...");

  try {
    const status = await getStatus();

    if (!status || redirected) return;

    if (status.loggedIn !== true) {
      redirectToLogin();
      return;
    }

    updateStatusDisplay(status);

    if (status.connected === true) {
      redirectToDashboard();
      return;
    }

    // If WhatsApp is already running, retrieve its QR without
    // starting another connection.
    if (status.qrAvailable === true) {
      await fetchQR();
      startPolling();
      return;
    }

    // Start WhatsApp only when the backend reports it is not running.
    if (status.whatsappStarted !== true) {
      setMessage("Requesting WhatsApp connection...");

      const result = await apiRequest("/api/start-whatsapp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });

      if (!result || redirected) return;
    }

    setMessage(
      "Waiting for WhatsApp to generate a QR code. Keep this page open."
    );

    startPolling();

    // Check immediately instead of waiting for the next polling cycle.
    await refreshConnection();
  } catch (error) {
    console.error("WhatsApp startup error:", error);
    setError(error.message || "Could not start WhatsApp.");
  } finally {
    isStarting = false;

    if (button && !redirected) {
      button.disabled = false;
      button.textContent = "Show / Refresh QR";
    }
  }
}

// ---------- Refresh button ----------

async function handleRefresh() {
  if (redirected) return;

  const button = document.getElementById("refresh-status-button");

  if (button) {
    button.disabled = true;
    button.textContent = "Refreshing...";
  }

  clearError();

  try {
    await refreshConnection(true);
  } finally {
    if (button && !redirected) {
      button.disabled = false;
      button.textContent = "Refresh Status";
    }
  }
}

// ---------- Connection status ----------

async function refreshConnection(showFeedback = false) {
  if (isCheckingConnection || redirected) return;

  isCheckingConnection = true;

  try {
    const status = await getStatus();

    if (!status || redirected) return;

    if (status.loggedIn !== true) {
      redirectToLogin();
      return;
    }

    updateStatusDisplay(status);

    if (status.connected === true) {
      stopPolling();
      redirectToDashboard();
      return;
    }

    if (status.qrAvailable === true) {
      await fetchQR();
      startPolling();

      if (showFeedback) {
        setMessage("Status refreshed. Check the QR code below.");
      }

      return;
    }

    if (status.whatsappStarted === true) {
      // Keep checking until the QR becomes available or connection opens.
      startPolling();

      if (showFeedback) {
        setMessage(
          "WhatsApp is attempting to connect. Waiting for a QR code..."
        );
      }

      return;
    }

    if (showFeedback) {
      setMessage(
        "WhatsApp is disconnected. Click Add / Link WhatsApp to start."
      );
    }
  } catch (error) {
    console.error("Connection status error:", error);

    if (showFeedback) {
      setError(error.message || "Unable to refresh connection status.");
    } else {
      setMessage("Unable to reach the backend. Check that it is running.");
    }
  } finally {
    isCheckingConnection = false;
  }
}

// ---------- Retrieve and render QR ----------

async function fetchQR() {
  if (isFetchingQR || redirected) return;

  isFetchingQR = true;

  try {
    const data = await apiRequest("/api/whatsapp-qr");

    if (!data || redirected) {
      setQRStatus(
        startRequested
          ? "Waiting for WhatsApp to provide a QR code..."
          : "Click Add / Link WhatsApp to request a QR code."
      );
      return;
    }

    if (data.connected === true) {
      redirectToDashboard();
      return;
    }

    if (typeof data.qr !== "string" || !data.qr.trim()) {
      setQRStatus("No QR code available yet. Waiting for WhatsApp...");
      return;
    }

    await displayQR(data.qr);
  } catch (error) {
    console.error("QR retrieval error:", error);
    setQRStatus(`QR unavailable: ${error.message}`);
  } finally {
    isFetchingQR = false;
  }
}

async function displayQR(qr) {
  const qrImage = document.getElementById("qr");
  const qrContainer = document.getElementById("qr-container");

  if (!qrImage || !qrContainer) {
    throw new Error(
      "Missing #qr or #qr-container in connect.html."
    );
  }

  // This version expects the backend to return a data URL image.
  // It intentionally does not use the broken browser QR library.
  if (!qr.startsWith("data:image/")) {
    throw new Error(
      "The backend returned raw QR text instead of an image. " +
      "Update /api/whatsapp-qr in backend/index.js to return " +
      "{ qr: await QRCode.toDataURL(currentQRCode) }."
    );
  }

  if (qr === lastRenderedQR && qrImage.src) {
    qrContainer.hidden = false;
    qrImage.style.display = "block";
    return;
  }

  qrImage.onload = () => {
    setQRStatus(
      "QR code ready. Open WhatsApp → Linked devices → Link a device, then scan this code."
    );
  };

  qrImage.onerror = () => {
    setQRStatus(
      "The QR image could not be displayed. Refresh the page and try again."
    );
    console.error("The browser could not load the QR image.");
  };

  qrImage.alt = "WhatsApp linking QR code";
  qrImage.width = 280;
  qrImage.height = 280;
  qrImage.style.display = "block";

  // Show the container before assigning the image.
  qrContainer.hidden = false;
  qrImage.src = qr;
  lastRenderedQR = qr;

  console.log("WhatsApp QR image received; rendering automatically.");
}

// ---------- Status display ----------

function updateStatusDisplay(data) {
  const connectionStatus = document.getElementById("connection-status");
  const accountStatus = document.getElementById("account-status");
  const connectionMessage = document.getElementById("connection-message");
  const button = getAddButton();

  if (connectionStatus) {
    connectionStatus.textContent = data.connected
      ? "Connected"
      : data.qrAvailable
        ? "QR code available"
        : data.whatsappStarted
          ? "Connecting"
          : "Disconnected";
  }

  if (accountStatus) {
    accountStatus.textContent = data.loggedIn
      ? "Logged in"
      : "Not logged in";
  }

  if (connectionMessage) {
    connectionMessage.textContent = data.connected
      ? "WhatsApp is connected and ready to use."
      : data.qrAvailable
        ? "Your QR code is ready to scan."
        : data.whatsappStarted
          ? "Waiting for WhatsApp to connect or generate a QR code."
          : "WhatsApp is disconnected. Start the connection to continue.";
  }

  if (button && !isStarting) {
    button.disabled = data.connected === true;
    button.textContent = data.connected
      ? "WhatsApp Connected"
      : data.qrAvailable
        ? "Show / Refresh QR"
        : "Add / Link WhatsApp";
  }

  if (data.connected) {
    hideQR();
  }
}

// ---------- Polling ----------

function startPolling() {
  if (pollInterval !== null || redirected) return;

  pollInterval = setInterval(() => {
    if (!document.hidden && !redirected) {
      refreshConnection();
    }
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollInterval !== null) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ---------- UI helpers ----------

function getAddButton() {
  return document.getElementById("add-instance-button");
}

function hideQR() {
  const qrImage = document.getElementById("qr");
  const qrContainer = document.getElementById("qr-container");

  if (qrImage) {
    qrImage.style.display = "none";
    qrImage.removeAttribute("src");
    qrImage.onload = null;
    qrImage.onerror = null;
  }

  if (qrContainer) {
    qrContainer.hidden = true;
  }

  lastRenderedQR = null;
}

function setQRStatus(message) {
  const element = document.getElementById("qr-status");
  if (element) element.textContent = message;
}

function setMessage(message) {
  const element = document.getElementById("connection-message");
  if (element) element.textContent = message;
}

function setError(message) {
  const element = document.getElementById("page-error");

  if (element) {
    element.textContent = message;
  } else {
    setMessage(message);
  }
}

function clearError() {
  const element = document.getElementById("page-error");
  if (element) element.textContent = "";
}

function redirectToLogin() {
  if (redirected) return;

  redirected = true;
  stopPolling();
  window.location.replace("login.html");
}

function redirectToDashboard() {
  if (redirected) return;

  redirected = true;
  stopPolling();
  window.location.replace("dashboard.html");
}

// Supports older HTML using onclick="getQR()".
window.getQR = getQR;