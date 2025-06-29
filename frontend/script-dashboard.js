// Show the correct section
function showSection(sectionId) {
  document.querySelectorAll(".section").forEach((sec) => {
    sec.style.display = "none";
  });
  document.getElementById(sectionId).style.display = "block";
}

// Check WhatsApp connection and redirect if not connected
async function checkConnectionOrRedirect() {
  const user = JSON.parse(localStorage.getItem("user"));
  if (!user || !user.id) {
    alert("⚠️ Not logged in. Redirecting...");
    window.location.href = "login.html";
    return;
  }

  try {
    const res = await fetch(
      `https://whatsappsenderapp.herokuapp.com/status/${user.id}`
    );
    const data = await res.json();

    if (!res.ok || !data.connected) {
      alert("❌ WhatsApp not connected. Redirecting...");
      window.location.href = "connect.html";
    }
  } catch (error) {
    console.error("❌ Connection check failed:", error);
    alert("⚠️ Could not verify WhatsApp connection. Redirecting...");
    window.location.href = "connect.html";
  }
}

// Send message with WhatsApp connection check
async function send() {
  const user = JSON.parse(localStorage.getItem("user"));
  if (!user || !user.id) {
    alert("⚠️ Not logged in.");
    return;
  }

  try {
    const res = await fetch(
      `https://whatsappsenderapp.herokuapp.com/status/${user.id}`
    );
    const data = await res.json();
    if (!res.ok || !data.connected) {
      alert("❌ WhatsApp not connected. Redirecting...");
      window.location.href = "connect.html";
      return;
    }
  } catch (err) {
    console.error("Connection check error:", err);
    alert("❌ Could not check WhatsApp connection.");
    return;
  }

  const numbersInput = document.getElementById("numbers").value.trim();
  const message = document.getElementById("message").value.trim();

  if (!numbersInput || !message) {
    alert("⚠️ Please fill in both phone numbers and message.");
    return;
  }

  const numbers = numbersInput
    .split(",")
    .map((num) => num.trim())
    .filter((num) => num.length > 0);

  try {
    const sendRes = await fetch(
      `https://whatsappsenderapp.herokuapp.com/send/${user.id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numbers, message }),
      }
    );

    const result = await sendRes.json();

    if (sendRes.ok) {
      alert("✅ Message sent successfully!");
      addToHistory(numbers, message);
      document.getElementById("numbers").value = "";
      document.getElementById("message").value = "";
    } else {
      alert("❌ " + (result.error || "Failed to send message."));
    }
  } catch (error) {
    console.error("Sending failed:", error);
    alert("❌ Could not connect to backend.");
  }
}

// Add sent message to history and localStorage
function addToHistory(numbers, message) {
  const tbody = document.getElementById("history-body");
  const now = new Date().toLocaleString();
  const entries = [];

  numbers.forEach((number) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${number}</td>
      <td>${message}</td>
      <td>${now}</td>
    `;
    tbody.prepend(row);
    entries.push({ number, message, time: now });
  });

  const saved = JSON.parse(localStorage.getItem("messageHistory")) || [];
  localStorage.setItem(
    "messageHistory",
    JSON.stringify([...entries, ...saved])
  );
}

// On page load: load message history and check WhatsApp connection
window.addEventListener("DOMContentLoaded", () => {
  const saved = JSON.parse(localStorage.getItem("messageHistory")) || [];
  const tbody = document.getElementById("history-body");

  saved.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.number}</td>
      <td>${item.message}</td>
      <td>${item.time}</td>
    `;
    tbody.appendChild(row);
  });

  checkConnectionOrRedirect();
});
