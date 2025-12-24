const BACKEND_URL =
  "https://luke-chat-app-frontend.hosting.codeyourfuture.io";
const API_BASE = `${BACKEND_URL}/api`;
const WS_URL = `${BACKEND_URL.replace("https://", "wss://").replace(
  "http://",
  "ws://"
)}/ws`;

// Local testing - uncomment to use local backend
// const API_BASE = "http://localhost:3000/api";
// const WS_URL = "ws://localhost:3000/ws";

let currentUser = null;
let ws = null;
let pollingFallback = null;

async function apiFetch(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

const apiGet = (path) => apiFetch(path, { method: "GET" });
const apiPost = (path, body) =>
  apiFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
  });

async function initializeUser() {
  currentUser = localStorage.getItem("chatUser");

  if (!currentUser) {
    currentUser = prompt("Enter your chat name:");
    if (!currentUser) {
      alert("Name required.");
      return;
    }
    localStorage.setItem("chatUser", currentUser);
  }

  await apiPost("/join", { user: currentUser });
}

function renderMessage(msg) {
  const chatBox = document.getElementById("chatBox");

  if (msg.id) {
    const existing = chatBox.querySelector(`[data-id="${msg.id}"]`);
    if (existing) return;
  }

  const div = document.createElement("div");

  if (msg.id) div.dataset.id = msg.id;

  let className = "message";
  if (msg.type === "system") {
    className += " system";
  } else {
    className += msg.user === currentUser ? " self" : " other";
  }

  if (msg.pending) className += " pending";

  div.className = className;

  const userLabel =
    msg.type === "system" ? "" : `<div class="meta">${msg.user}</div>`;

  div.innerHTML = `
    ${userLabel}
    <div class="text">${msg.text}</div>
    ${
      msg.type !== "system"
        ? `
      <div class="reactions">
        <span class="like">👍 ${msg.likes || 0}</span>
        <span class="dislike">👎 ${msg.dislikes || 0}</span>
      </div>`
        : ""
    }
    <span class="timestamp">
      ${new Date(msg.timestamp || Date.now()).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}
    </span>
  `;

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;

  if (msg.type !== "system" && msg.id) {
    div.querySelector(".like").onclick = () => reactToMessage(msg.id, "like");
    div.querySelector(".dislike").onclick = () =>
      reactToMessage(msg.id, "dislike");
  }
}

function updateMessage(msg) {
  if (!msg || !msg.id) return;

  const existing = document.querySelector(`[data-id="${msg.id}"]`);

  if (!existing) {
    renderMessage(msg);
    return;
  }

  const likeEl = existing.querySelector(".like");
  const dislikeEl = existing.querySelector(".dislike");

  if (likeEl) {
    likeEl.textContent = `👍 ${msg.likes || 0}`;
  }
  if (dislikeEl) {
    dislikeEl.textContent = `👎 ${msg.dislikes || 0}`;
  }

  existing.classList.remove("pending");
}

function updateOnline(users) {
  const text =
    users.length === 1 ? "1 user online" : `${users.length} users online`;
  document.getElementById("onlineCount").textContent = text;
}

async function updateOnlineUsers() {
  try {
    const data = await apiGet("/online-users");
    updateOnline(data.onlineUsers);
  } catch (err) {
    console.error("Failed to update online users:", err);
  }
}

function sendMessage(text) {
  if (!text.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;

  renderMessage({
    id: `temp-${Date.now()}`,
    user: currentUser,
    text,
    timestamp: new Date().toISOString(),
    likes: 0,
    dislikes: 0,
    type: "message",
    pending: true,
  });

  ws.send(
    JSON.stringify({
      type: "message",
      user: currentUser,
      text,
    })
  );
}

async function reactToMessage(id, type) {
  if (typeof id === "string" && id.startsWith("temp-")) {
    return;
  }

  try {
    const updatedMsg = await apiPost("/react", { id, type });
    updateMessage(updatedMsg);
  } catch (err) {
    console.error("Reaction failed:", err);
  }
}

function startWebSocket() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log("✅ WebSocket connected");
    if (pollingFallback) {
      clearInterval(pollingFallback);
      pollingFallback = null;
    }
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    const chatBox = document.getElementById("chatBox");

    switch (data.type) {
      case "init":
        data.messages.forEach(renderMessage);
        updateOnline(data.onlineUsers);
        break;

      case "online-users":
        updateOnline(data.onlineUsers);
        break;

      case "new-message":
      case "message":
        if (data.user === currentUser && typeof data.id === "number") {
          const pendingMsgs = chatBox.querySelectorAll(".pending");
          pendingMsgs.forEach((pending) => {
            const textEl = pending.querySelector(".text");
            if (textEl && textEl.textContent === data.text) {
              pending.remove();
            }
          });
        }
        renderMessage(data);
        break;

      case "system":
        renderMessage(data);
        break;

      case "update":
        updateMessage(data);
        break;

      default:
        console.log("Unknown WS event:", data);
    }
  };

  ws.onclose = () => {
    console.warn("⚠️ WebSocket disconnected — polling fallback enabled");
    pollingFallback = setInterval(loadMessages, 5000);
    setTimeout(startWebSocket, 3000);
  };

  ws.onerror = (err) => console.error("WebSocket error:", err);
}

async function loadMessages() {
  try {
    const msgs = await apiGet("/messages");
    msgs.forEach((msg) => {
      if (msg.id) {
        const existing = document.querySelector(`[data-id="${msg.id}"]`);
        if (!existing) {
          renderMessage(msg);
        }
      } else {
        renderMessage(msg);
      }
    });
  } catch (err) {
    console.error("Polling error:", err);
  }
}

document.getElementById("messageForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("message");
  sendMessage(input.value);
  input.value = "";
});

document.getElementById("leave").addEventListener("click", async () => {
  try {
    await apiPost("/leave", { user: currentUser });
  } catch {}

  localStorage.removeItem("chatUser");
  window.location.reload();
});

window.addEventListener("load", async () => {
  await initializeUser();
  startWebSocket();
});
