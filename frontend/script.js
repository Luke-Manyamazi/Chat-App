// Backend & WebSocket endpoints
const API_BASE = "https://luke-chat-app-backend.hosting.codeyourfuture.io";
const WS_URL = "wss://luke-chat-app-backend.hosting.codeyourfuture.io";

// for testing locally
// const API_BASE = "http://localhost:3000";
// const WS_URL = "ws://localhost:3000";

// User state
let currentUser = null;
let ws = null;

// Helper Functions for API Calls
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

// Initialize User
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

// Send Message
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

// Load Messages (Polling Backup)
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

function renderMessage(msg) {
  const chatBox = document.getElementById("chatBox");
  const div = document.createElement("div");

  if (msg.id) div.dataset.id = msg.id;

  let className = "message";
  if (msg.type === "system") {
    className += " system"; // optional styling for system messages
  } else {
    const isMine = msg.user === currentUser;
    className += isMine ? " self" : " other";
  }

  div.className = className;

  const displayUser = msg.type === "system" ? "" : msg.user;

  div.innerHTML = `
    ${displayUser ? `<div class="meta">${displayUser}</div>` : ""}
    <div class="text">${msg.text}</div>
    ${msg.type !== "system" ? `
      <div class="reactions">
        <span class="like" data-id="${msg.id}">👍 ${msg.likes || 0}</span>
        <span class="dislike" data-id="${msg.id}">👎 ${msg.dislikes || 0}</span>
      </div>` : ""}
    <span class="timestamp">${new Date(
      msg.timestamp || Date.now()
    ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
  `;

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;

  // Only attach event listeners for user messages
  if (msg.type !== "system") {
    div.querySelector(".like").addEventListener("click", () => reactToMessage(msg.id, "like"));
    div.querySelector(".dislike").addEventListener("click", () => reactToMessage(msg.id, "dislike"));
  }
}


// React to Message
async function reactToMessage(id, type) {
  try {
    const updated = await apiPost("/react", { id, type });
    updateMessage(updated); // update UI after reaction
  } catch (err) {
    console.error("❌ Failed to react:", err);
  }
}

// WebSocket Connection
function startWebSocket() {
  console.log("Connecting to WebSocket...");
  ws = new WebSocket(WS_URL);

  ws.onopen = () => console.log("✅ WebSocket connected");
  ws.onerror = (err) => console.error("WebSocket error:", err);
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

// Online Users Update
function updateOnline(users) {
  const count = users.length;
  const text = count === 1 ? "1 user online" : `${count} users online`;
  document.getElementById("onlineCount").textContent = text;
}

// Message Update
function updateMessage(msg) {
  const all = document.querySelectorAll(".message");
  all.forEach((el) => {
    if (div.dataset.id === msg.id) {
      el.querySelector(".text").textContent = msg.text;
    }
  });
}

// Event Listeners
document.getElementById("messageForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("message");
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

document.getElementById("leave").addEventListener("click", async () => {
  try {
    await apiPost("/leave", { user: currentUser });
  } catch (err) {
    console.warn("Could not notify backend about leaving:", err);
  }

  // Remove user from localStorage
  localStorage.removeItem("chatUser");

  // Show a system message in the chat box
  renderMessage({
    text: `${currentUser} has left the chat.`,
    time: Date.now(),
  });

  // Optionally reload or redirect
  setTimeout(() => {
    window.location.reload();
  }, 1000);
});
