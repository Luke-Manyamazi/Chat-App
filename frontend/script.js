const chatBox = document.getElementById("chatbox");
const chatForm = document.getElementById("chat-form");
const leaveBtn = document.getElementById("leave");

// --- Backend URL - now relative since served from same origin ---
const backendURL = "/api";

let lastId = 0;
let currentUser = "";
let onlineUsers = [];

// --- Prompt for username ---
function initializeUser() {
  currentUser = prompt("Enter your name:") || "Anonymous";
  if (!currentUser) currentUser = "Anonymous";
  
  fetch(`${backendURL}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: currentUser }),
  })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.json();
    })
    .then((data) => {
      onlineUsers = data.onlineUsers || [];
      updateOnlineUsers(onlineUsers);
    })
    .catch(err => {
      console.error("Join error:", err);
      alert("Failed to join chat. Please refresh and try again.");
    });
}

// --- Poll online users ---
async function pollOnlineUsers() {
  try {
    const res = await fetch(`${backendURL}/online-users`);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    updateOnlineUsers(data.onlineUsers || []);
  } catch (err) {
    console.error("Online users poll error:", err);
  }
  setTimeout(pollOnlineUsers, 5000);
}

// --- Poll messages ---
async function pollMessages() {
  try {
    const res = await fetch(`${backendURL}/messages?since=${lastId}`);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const msgs = await res.json();
    msgs.forEach(renderMessage);
  } catch (err) {
    console.error("Messages poll error:", err);
  }
  setTimeout(pollMessages, 1000);
}

// --- Render a message ---
function renderMessage(msg) {
  let existing = document.getElementById("msg-" + msg.id);
  if (existing) {
    const likeCount = existing.querySelector(".like-count");
    const dislikeCount = existing.querySelector(".dislike-count");
    if (likeCount) likeCount.textContent = msg.likes;
    if (dislikeCount) dislikeCount.textContent = msg.dislikes;
    return;
  }

  const msgDiv = document.createElement("div");
  msgDiv.id = "msg-" + msg.id;
  msgDiv.className = "message";

  if (msg.type === "system") {
    msgDiv.classList.add("system");
    msgDiv.innerHTML = `<em>${msg.text}</em>`;
  } else {
    msgDiv.classList.add(msg.user === currentUser ? "self" : "other");
    msgDiv.innerHTML = `
      <strong>${msg.user}</strong>: ${msg.text}
      <span class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</span>
      <div class="reactions">
        <button onclick="react(${msg.id}, 'like')">👍 <span class="like-count">${msg.likes}</span></button>
        <button onclick="react(${msg.id}, 'dislike')">👎 <span class="dislike-count">${msg.dislikes}</span></button>
      </div>
    `;
  }

  chatBox.appendChild(msgDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
  lastId = Math.max(lastId, msg.id);
}

// --- Update online users ---
function updateOnlineUsers(users) {
  onlineUsers = users;
  const onlineDiv = document.getElementById("online-users");
  onlineDiv.textContent = `Online: ${users.length}`;
}

// --- React ---
function react(id, type) {
  fetch(`${backendURL}/react`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, type }),
  }).catch(err => console.error("React error:", err));
}

// --- Send message ---
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = document.getElementById("message").value.trim();
  if (!text) return;

  try {
    const response = await fetch(`${backendURL}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: currentUser, text }),
    });
    
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    document.getElementById("message").value = "";
  } catch (err) {
    console.error("Send message error:", err);
    alert("Failed to send message. Please try again.");
  }
});

// --- Leave chat ---
function leaveChat() {
  fetch(`${backendURL}/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: currentUser }),
  }).then(() => {
    alert("You left the chat!");
    window.location.href = "/";
  }).catch(err => {
    console.error("Leave error:", err);
    window.location.href = "/";
  });
}

leaveBtn.addEventListener("click", leaveChat);

window.addEventListener("beforeunload", () => {
  // Try to send leave request, but don't wait for it
  fetch(`${backendURL}/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: currentUser }),
    keepalive: true
  }).catch(() => {});
});

// --- Start polling ---
initializeUser();
setTimeout(() => {
  pollMessages();
  pollOnlineUsers();
}, 100);