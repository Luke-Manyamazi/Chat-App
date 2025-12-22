
const API_BASE = "/api";
const WS_URL = (window.location.protocol === "https:" ? "wss" : "ws") + "://" + window.location.host + "/ws";

// Local testing
// const API_BASE = "http://localhost:3000";
// const WS_URL = "ws://localhost:3000";


let currentUser = null;
let ws = null;
let pollingFallback = null;



async function apiFetch(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

const apiGet = path => apiFetch(`/api${path}`, { method: "GET" });
const apiPost = (path, body) =>
  apiFetch(`/api${path}`, {
    method: "POST",
    body: JSON.stringify(body)
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

  const userLabel = msg.type === "system" ? "" : `<div class="meta">${msg.user}</div>`;

  div.innerHTML = `
    ${userLabel}
    <div class="text">${msg.text}</div>
    ${msg.type !== "system" ? `
      <div class="reactions">
        <span class="like">👍 ${msg.likes || 0}</span>
        <span class="dislike">👎 ${msg.dislikes || 0}</span>
      </div>` : ""}
    <span class="timestamp">
      ${new Date(msg.timestamp || Date.now()).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })}
    </span>
  `;

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;

  if (msg.type !== "system" && msg.id) {
    div.querySelector(".like").onclick = () => reactToMessage(msg.id, "like");
    div.querySelector(".dislike").onclick = () => reactToMessage(msg.id, "dislike");
  }
}

function updateMessage(msg) {
  document.querySelectorAll(".message").forEach(el => {
    if (el.dataset.id == msg.id) {
      el.querySelector(".text").textContent = msg.text;
      el.querySelector(".like").textContent = `👍 ${msg.likes}`;
      el.querySelector(".dislike").textContent = `👎 ${msg.dislikes}`;
      el.classList.remove("pending");
    }
  });
}

function updateOnline(users) {
  const text =
    users.length === 1 ? "1 user online" : `${users.length} users online`;
  document.getElementById("onlineCount").textContent = text;
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
    pending: true
  });

  ws.send(JSON.stringify({
    type: "message",
    user: currentUser,
    text
  }));
}

async function reactToMessage(id, type) {
  try {
    await apiPost("/react", { id, type });
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

  ws.onmessage = event => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case "init":
        data.messages.forEach(renderMessage);
        updateOnline(data.onlineUsers);
        break;

      case "new-message":
      case "message":
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
    pollingFallback = setInterval(loadMessages, 10000);
    setTimeout(startWebSocket, 3000);
  };

  ws.onerror = err => console.error("WebSocket error:", err);
}


async function loadMessages() {
  try {
    const msgs = await apiGet("/messages");
    msgs.forEach(renderMessage);
  } catch (err) {
    console.error("Polling error:", err);
  }
}


document.getElementById("messageForm").addEventListener("submit", e => {
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
