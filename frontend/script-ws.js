const chatBox = document.getElementById("chatbox");
const chatForm = document.getElementById("chat-form");
const leaveBtn = document.getElementById("leave");

// --- Backend URLs - now relative since served from same origin ---
const apiURL = "/api";

// WebSocket URL construction
const getWebSocketURL = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
};

const wsURL = getWebSocketURL();

let currentUser = "";
let ws;

console.log("WebSocket URL:", wsURL);
console.log("API URL:", apiURL);

// --- Initialize user and connection ---
function initializeUser() {
  currentUser = prompt("Enter your name:") || "Anonymous";
  if (!currentUser) currentUser = "Anonymous";
  
  // Join via REST API first
  fetch(`${apiURL}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: currentUser }),
  }).catch(err => console.error("Join error:", err));
  
  // Then connect WebSocket
  connectWebSocket();
}

// --- Connect WebSocket ---
function connectWebSocket() {
  try {
    ws = new WebSocket(wsURL);

    ws.onopen = () => {
      console.log("✅ Connected via WebSocket");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "init") {
          data.messages.forEach(renderMessage);
          updateOnlineUsers(data.onlineUsers || []);
        }

        if (data.type === "new-message") {
          renderMessage(data.message);
        }

        if (data.type === "update") {
          updateMessage(data.message);
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    ws.onclose = (event) => {
      console.log("WebSocket connection closed:", event.code, event.reason);
      // Attempt to reconnect after 3 seconds
      setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
  } catch (error) {
    console.error("Error creating WebSocket:", error);
    setTimeout(connectWebSocket, 3000);
  }
}

// --- Send message ---
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = document.getElementById("message").value.trim();
  if (!text) return;

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "message", user: currentUser, text }));
    document.getElementById("message").value = "";
  } else {
    alert("WebSocket not connected. Trying to reconnect...");
    connectWebSocket();
  }
});

// --- React (like/dislike) ---
function react(id, reaction) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "react", id, reaction }));
  } else {
    // Fallback to REST API if WebSocket is not available
    fetch(`${apiURL}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, type: reaction }),
    }).catch(err => console.error("React error:", err));
  }
}

// --- Render ---
function renderMessage(msg) {
  let existing = document.getElementById("msg-" + msg.id);
  if (existing) return updateMessage(msg);

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

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function updateMessage(msg) {
  const div = document.getElementById("msg-" + msg.id);
  if (div) {
    const likeCount = div.querySelector(".like-count");
    const dislikeCount = div.querySelector(".dislike-count");
    if (likeCount) likeCount.textContent = msg.likes;
    if (dislikeCount) dislikeCount.textContent = msg.dislikes;
  }
}

function updateOnlineUsers(users) {
  const onlineDiv = document.getElementById("online-users");
  onlineDiv.textContent = `Online: ${users.length}`;
}

// --- Leave ---
leaveBtn.addEventListener("click", () => {
  fetch(`${apiURL}/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: currentUser }),
  }).then(() => {
    if (ws) ws.close();
    alert("You left the chat!");
    window.location.href = "/";
  }).catch(err => {
    console.error("Leave error:", err);
    window.location.href = "/";
  });
});

window.addEventListener("beforeunload", () => {
  // Try to send leave request, but don't wait for it
  fetch(`${apiURL}/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: currentUser }),
    keepalive: true
  }).catch(() => {});
});

// --- Initialize ---
initializeUser();