// ----------------------------
// Chat App Frontend Script
// ----------------------------

// Backend & WebSocket endpoints
const API_BASE = "https://luke-chat-app-backend.hosting.codeyourfuture.io";
const WS_URL = "wss://luke-chat-app-backend.hosting.codeyourfuture.io";

// User state
let currentUser = null;
let ws = null;

// ----------------------------
// Helper Functions for API Calls
// ----------------------------
async function apiFetch(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

const apiGet = (path) => apiFetch(`/api${path}`, { method: "GET" });
const apiPost = (path, body) =>
  apiFetch(`/api${path}`, { method: "POST", body: JSON.stringify(body) });

// ----------------------------
// Initialize User
// ----------------------------
async function initializeUser() {
  currentUser = localStorage.getItem("chatUser");

  if (!currentUser) {
    currentUser = prompt("Enter your chat name:");
    if (!currentUser) {
      alert("Name required to join the chat.");
      return;
    }
    localStorage.setItem("chatUser", currentUser);
  }

  try {
    await apiPost("/join", { user: currentUser });
    console.log(`✅ Joined chat as ${currentUser}`);
  } catch (err) {
    console.error("❌ Join error:", err);
    alert("Failed to join chat. Please try again later.");
  }
}

// ----------------------------
// Send Message
// ----------------------------
async function sendMessage(text) {
  if (!text.trim()) return;

  const message = {
    user: currentUser,
    text,
  };

  try {
    await apiPost("/messages", message);
  } catch (err) {
    console.error("❌ Failed to send message:", err);
  }
}

// ----------------------------
// Load Messages (Polling Backup)
// ----------------------------
async function loadMessages() {
  try {
    const msgs = await apiGet("/messages");
    const chatBox = document.getElementById("chatBox");
    chatBox.innerHTML = ""; // clear old
    msgs.forEach(renderMessage);
  } catch (err) {
    console.error("❌ Error loading messages:", err);
  }
}

// ----------------------------
// Render Message to UI
// ----------------------------
function renderMessage(msg) {
  const chatBox = document.getElementById("chatBox");
  const div = document.createElement("div");
  div.classList.add("message");

  const isMine = msg.user === currentUser;
  div.classList.add(isMine ? "mine" : "theirs");

  div.innerHTML = `
    <div class="meta">
      <strong>${msg.user}</strong>
      <span>${new Date(msg.time || Date.now()).toLocaleTimeString()}</span>
    </div>
    <div class="text">${msg.text}</div>
  `;

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ----------------------------
// WebSocket Connection
// ----------------------------
function startWebSocket() {
  console.log("🔌 Connecting to WebSocket...");
  ws = new WebSocket(WS_URL);

  ws.onopen = () => console.log("✅ WebSocket connected");
  ws.onerror = (err) => console.error("❌ WebSocket error:", err);
  ws.onclose = () => {
    console.warn("⚠️ WebSocket disconnected, retrying...");
    setTimeout(startWebSocket, 3000);
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    switch (data.type) {
      case "init":
        data.messages?.forEach(renderMessage);
        updateOnline(data.onlineUsers || []);
        break;
      case "new-message":
        renderMessage(data.message);
        break;
      case "update":
        updateMessage(data.message);
        break;
      default:
        console.log("ℹ️ Unknown event type:", data);
    }
  };
}

// ----------------------------
// Online Users Update
// ----------------------------
function updateOnline(users) {
  const list = document.getElementById("onlineUsers");
  list.innerHTML = users.map((u) => `<li>${u}</li>`).join("");
}

// ----------------------------
// Message Update (if edited)
// ----------------------------
function updateMessage(msg) {
  const all = document.querySelectorAll(".message");
  all.forEach((el) => {
    if (el.dataset.id === msg.id) {
      el.querySelector(".text").textContent = msg.text;
    }
  });
}

// ----------------------------
// Event Listeners
// ----------------------------
document.getElementById("messageForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("messageInput");
  sendMessage(input.value);
  input.value = "";
});

window.addEventListener("load", async () => {
  await initializeUser();
  await loadMessages();
  startWebSocket();

  // Optional polling every 10 seconds (backup)
  setInterval(loadMessages, 10000);
});
