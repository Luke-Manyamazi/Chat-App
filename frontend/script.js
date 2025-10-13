// --- Deployment URLs ---
const API_URL = "https://luke-chat-app-backend.hosting.codeyourfuture.io/api";
const WS_URL  = "wss://luke-chat-app-backend.hosting.codeyourfuture.io";

// --- DOM Elements ---
const chatBox = document.getElementById("chatbox");
const chatForm = document.getElementById("chat-form");
const leaveBtn = document.getElementById("leave");
const onlineDiv = document.getElementById("online-users");

// --- State ---
let currentUser = "";
let lastId = 0;
let onlineUsers = [];
let ws;
const chatMode = sessionStorage.getItem("chatMode") || "polling";

// --- Helper: API Fetch ---
async function apiFetch(endpoint, options = {}) {
  const res = await fetch(API_URL + endpoint, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}
const apiGet = (url) => apiFetch(url, { method: "GET" });
const apiPost = (url, body) => apiFetch(url, { method: "POST", body: JSON.stringify(body) });

// --- WebSocket Send ---
function wsSend(data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}


// --- Helper: Render Messages ---
function createMessageDiv(msg) {
  const div = document.createElement("div");
  div.id = "msg-" + msg.id;
  div.className = "message";

  if (msg.type === "system") {
    div.classList.add("system");
    div.innerHTML = `<em>${msg.text}</em>`;
  } else {
    div.classList.add(msg.user === currentUser ? "self" : "other");
    div.innerHTML = `
      <strong>${msg.user}</strong>: ${msg.text}
      <span class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</span>
      <div class="reactions">
        <button onclick="react(${msg.id}, 'like')">👍 <span class="like-count">${msg.likes}</span></button>
        <button onclick="react(${msg.id}, 'dislike')">👎 <span class="dislike-count">${msg.dislikes}</span></button>
      </div>`;
  }
  return div;
}

function renderMessage(msg) {
  const existing = document.getElementById("msg-" + msg.id);
  if (existing) return updateMessage(msg);

  const div = createMessageDiv(msg);
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
  lastId = Math.max(lastId, msg.id);
}

function updateMessage(msg) {
  const div = document.getElementById("msg-" + msg.id);
  if (!div) return;
  const updateCount = (selector, value) => {
    const el = div.querySelector(selector);
    if (el) el.textContent = value;
  };
  updateCount(".like-count", msg.likes);
  updateCount(".dislike-count", msg.dislikes);
}

function updateOnline(users) {
  onlineUsers = users;
  onlineDiv.textContent = `Online: ${users.length}`;
}

// --- Helper: WebSocket Send ---
function wsSend(data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

// --- React Function ---
function react(id, type) {
  if (chatMode === "websocket") {
    wsSend({ type: "react", id, reaction: type });
  } else {
    apiPost(`${API_URL}/react`, { id, type }).catch(console.error);
  }
}

// --- Initialize User ---
async function initUser() {
  currentUser = prompt("Enter your name:") || "Anonymous";

  await apiPost(`${API_URL}/join`, { user: currentUser });
  updateOnline(onlineUsers);

  if (chatMode === "polling") startPolling();
  else startWebSocket();
}

// --- Polling Mode ---
async function startPolling() {
  async function pollMessages() {
    try {
      const msgs = await apiGet(`/messages?since=${lastId}`);
      msgs.forEach(renderMessage);
    } catch (err) { console.error(err); }
    setTimeout(pollMessages, 1000);
  }

  async function pollOnlineUsers() {
    try {
      const data = await apiGet("/online-users");
      updateOnline(data.onlineUsers || []);
    } catch (err) { console.error(err); }
    setTimeout(pollOnlineUsers, 5000);
  }

  pollMessages();
  pollOnlineUsers();
}

// --- WebSocket Mode ---
function startWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onopen = () => console.log("✅ WS connected");
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "init") {
      data.messages.forEach(renderMessage);
      updateOnline(data.onlineUsers || []);
    }
    if (data.type === "new-message") renderMessage(data.message);
    if (data.type === "update") updateMessage(data.message);
  };
  ws.onclose = () => setTimeout(startWebSocket, 3000);
  ws.onerror = console.error;
}

// --- Send Message ---
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = document.getElementById("message").value.trim();
  if (!text) return;

  if (chatMode === "websocket") {
    wsSend({ type: "message", user: currentUser, text });
  } else {
    await apiPost(`${API_URL}/messages`, { user: currentUser, text });
  }
  document.getElementById("message").value = "";
});

// --- Leave Chat ---
async function leaveChat() {
  try { await apiPost(`${API_URL}/leave`, { user: currentUser }); } catch {}
  if (ws) ws.close();
  window.location.href = "/";
}
leaveBtn.addEventListener("click", leaveChat);
window.addEventListener("beforeunload", leaveChat);

// --- Start ---
initUser();
