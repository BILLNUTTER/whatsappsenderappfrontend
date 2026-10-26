
const API_URL = "http://127.0.0.1:3000";

let historyRequestInProgress = false;
let sendRequestInProgress = false;

// --------------------------------------------------
// Dashboard navigation
// --------------------------------------------------

function showSection(sectionId) {
  document.querySelectorAll(".section").forEach((section) => {
    section.hidden = section.id !== sectionId;
  });

  if (sectionId === "history") {
    loadHistory();
  }
}

// --------------------------------------------------
// Backend requests
// --------------------------------------------------

async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    window.location.replace("login.html");
    throw new Error("Your login session has expired. Please log in again.");
  }

  return { response, data };
}

// --------------------------------------------------
// Login and connection status
// --------------------------------------------------

async function checkConnectionOrRedirect() {
  const statusElement = document.getElementById("send-status");

  try {
    const { response, data } = await apiRequest("/status");

    if (!response.ok) {
      throw new Error(data.error || `Status request failed: ${response.status}`);
    }

    if (!data.loggedIn) {
      window.location.replace("login.html");
      return false;
    }

    updateWhatsAppStatus(Boolean(data.connected));

    return true;
  } catch (error) {
    console.error("Connection check failed:", error);

    if (statusElement) {
      statusElement.textContent =
        "Cannot verify the backend connection. Check that the backend is running.";
    }

    // Do not redirect just because the backend is temporarily unavailable.
    return false;
  }
}

function updateWhatsAppStatus(connected) {
  const button = document.getElementById("whatsapp-status-button");
  const text = document.getElementById("whatsapp-status-text");

  if (button) {
    button.textContent = connected
      ? "WhatsApp: Connected — Disconnect"
      : "WhatsApp: Not connected — Connect";
  }

  if (text) {
    text.textContent = connected
      ? "WhatsApp is connected."
      : "WhatsApp is not connected. Connect before sending messages.";
  }
}

// --------------------------------------------------
// Send messages
// --------------------------------------------------

async function send() {
  if (sendRequestInProgress) return;

  const numbersElement = document.getElementById("numbers");
  const messageElement = document.getElementById("message");
  const sendButton = document.getElementById("send-button");
  const statusElement = document.getElementById("send-status");

  if (!numbersElement || !messageElement) {
    alert("Could not find the phone number and message fields.");
    return;
  }

  const numbersInput = numbersElement.value.trim();
  const message = messageElement.value.trim();

  if (!numbersInput || !message) {
    if (statusElement) {
      statusElement.textContent = "Enter phone numbers and a message.";
    }
    return;
  }

  const numbers = numbersInput
    .split(/[,\n;]+/)
    .map((number) => number.trim())
    .filter(Boolean);

  if (numbers.length === 0) {
    if (statusElement) {
      statusElement.textContent = "Enter at least one phone number.";
    }
    return;
  }

  sendRequestInProgress = true;

  if (sendButton) {
    sendButton.disabled = true;
    sendButton.textContent = "Sending...";
  }

  if (statusElement) {
    statusElement.textContent = `Submitting message to ${numbers.length} recipient(s)...`;
  }

  try {
    const { response, data } = await apiRequest("/send-broadcast", {
      method: "POST",
      body: JSON.stringify({ numbers, message }),
    });

    if (!response.ok) {
      let errorMessage =
        data.error || data.message || `Sending failed (HTTP ${response.status}).`;

      if (response.status === 503) {
        errorMessage = "WhatsApp is not connected. Connect it before sending.";
        updateWhatsAppStatus(false);
      }

      if (response.status === 504) {
        errorMessage +=
          " Check WhatsApp connection and message history before retrying, because some recipients may already have received the message.";
      }

      if (response.status === 502) {
        errorMessage +=
          " Check message history before retrying to avoid duplicate messages.";
      }

      if (statusElement) {
        const sentCount = Number(data.sentTo || 0);

        statusElement.textContent =
          sentCount > 0
            ? `${errorMessage} Successfully submitted before failure: ${sentCount}.`
            : errorMessage;
      }

      await loadHistory();
      return;
    }

    if (statusElement) {
      statusElement.textContent =
        data.message || `Message sent to ${data.sentTo ?? numbers.length} recipient(s).`;
    }

    numbersElement.value = "";
    messageElement.value = "";

    await loadHistory();
  } catch (error) {
    console.error("Sending failed:", error);

    if (statusElement) {
      statusElement.textContent =
        error.message || "Could not connect to the backend.";
    }
  } finally {
    sendRequestInProgress = false;

    if (sendButton) {
      sendButton.disabled = false;
      sendButton.textContent = "Send Message";
    }
  }
}

// --------------------------------------------------
// Message history
// --------------------------------------------------

async function loadHistory() {
  const tbody = document.getElementById("history-body");
  const statusElement = document.getElementById("history-status");

  if (!tbody || historyRequestInProgress) return;

  historyRequestInProgress = true;

  if (statusElement) {
    statusElement.textContent = "Loading message history...";
  }

  try {
    const { response, data } = await apiRequest("/api/logs");

    if (!response.ok) {
      throw new Error(
        data.error || `History request failed: HTTP ${response.status}`
      );
    }

    const logs = Array.isArray(data)
      ? data
      : Array.isArray(data.logs)
        ? data.logs
        : [];

    const fragment = document.createDocumentFragment();

    logs.forEach((entry) => {
      const recipients = Array.isArray(entry.numbers)
        ? entry.numbers
        : [
            entry.number ||
            entry.phone ||
            entry.to ||
            "",
          ];

      const recipientText = recipients.filter(Boolean);

      // Display one row per recipient when the log contains multiple numbers.
      const rows = recipientText.length ? recipientText : [""];

      rows.forEach((number) => {
        const row = document.createElement("tr");

        const values = [
          number,
          entry.message || "",
          entry.timestamp || entry.time || entry.date || "",
        ];

        values.forEach((value) => {
          const cell = document.createElement("td");
          cell.textContent = String(value ?? "");
          row.appendChild(cell);
        });

        fragment.appendChild(row);
      });
    });

    tbody.replaceChildren(fragment);

    if (statusElement) {
      statusElement.textContent = logs.length
        ? ""
        : "No message history is available yet.";
    }
  } catch (error) {
    console.error("Could not load message history:", error);

    if (statusElement) {
      statusElement.textContent =
        error.message || "Could not load message history. Please try again.";
    }
  } finally {
    historyRequestInProgress = false;
  }
}

// --------------------------------------------------
// Dashboard initialization
// --------------------------------------------------

window.addEventListener("DOMContentLoaded", async () => {
  const authenticated = await checkConnectionOrRedirect();

  if (authenticated) {
    await loadHistory();
  }
});
