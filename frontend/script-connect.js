let pollInterval;

window.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("user"));

  if (!user || !user.id) {
    alert("⚠️ You're not logged in. Redirecting to login...");
    window.location.href = "login.html";
    return;
  }

  try {
    const statusRes = await fetch(
      `https://whatsappsenderapp.herokuapp.com/status/${user.id}`
    );
    const statusData = await statusRes.json();

    if (statusRes.ok && statusData.connected) {
      alert("✅ WhatsApp is already linked!");
      window.location.href = "dashboard.html";
      return;
    }

    console.log("ℹ️ Not connected. Awaiting QR scan.");
  } catch (err) {
    console.error("Error checking initial connection status:", err);
    alert("❌ Could not check WhatsApp status.");
  }
});

async function getQR() {
  const user = JSON.parse(localStorage.getItem("user"));

  if (!user || !user.id) {
    alert("⚠️ You're not logged in. Redirecting to login...");
    window.location.href = "login.html";
    return;
  }

  try {
    const res = await fetch(
      `https://whatsappsenderapp.herokuapp.com/qr/${user.id}`
    );
    const data = await res.json();

    if (res.ok && data.qr) {
      const qrImage = document.getElementById("qr");
      qrImage.src = data.qr;
      qrImage.style.display = "block";

      // Start polling
      pollInterval = setInterval(() => checkConnection(user.id), 3000);
    } else {
      alert(data.message || data.error || "QR not ready. Try again.");
    }
  } catch (err) {
    console.error("QR fetch error:", err);
    alert("❌ Could not load QR. Try again later.");
  }
}

async function checkConnection(clientId) {
  try {
    const res = await fetch(
      `https://whatsappsenderapp.herokuapp.com/status/${clientId}`
    );
    const data = await res.json();

    if (res.ok && data.connected) {
      clearInterval(pollInterval);
      alert("✅ WhatsApp linked successfully!");
      window.location.href = "dashboard.html";
    }
  } catch (err) {
    console.error("Status check error:", err);
  }
}
