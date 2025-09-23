const chatBox = document.getElementById("chatbox");
const chatForm = document.getElementById("chat-form");
const backendURL = "https://luke-quote-app-backend.hosting.codeyourfuture.io/api";

let lastId = 0;
let currentUser = "";
let onlineUsers = [];

// --- Prompt for username ---
currentUser = prompt("Enter your name:");
fetch(`${backendURL}/join`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ user: currentUser }),
})
  .then(res => res.json())
  .then(data => {
    onlineUsers = data.onlineUsers;
    updateOnlineUsers(onlineUsers);
  });

// --- Poll online users ---
async function pollOnlineUsers() {
  try {
    const res = await fetch(`${backendURL}/online-users`);
    const data = await res.json();
    updateOnlineUsers(data.onlineUsers || []);
  } catch (err) {
    console.error(err);
  }
  setTimeout(pollOnlineUsers, 5000);
}

// --- Poll messages ---
async function pollMessages() {
  try {
    const res = await fetch(`${backendURL}/messages?since=${lastId}`);
    const msgs = await res.json();
    msgs.forEach(renderMessage);
  } catch (err) {
    console.error(err);
  }
  setTimeout(pollMessages, 1000);
}

// --- Render a message ---
function renderMessage(msg) {
  let existing = document.getElementById("msg-" + msg.id);
  if (existing) {
    existing.querySelector(".like-count").textContent = msg.likes;
    existing.querySelector(".dislike-count").textContent = msg.dislikes;
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
  lastId = msg.id;
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
  });
}

// --- Send message ---
chatForm.addEventListener("submit", async e => {
  e.preventDefault();
  const text = document.getElementById("message").value.trim();
  if (!text) return;

  await fetch(`${backendURL}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: currentUser, text }),
  });

  document.getElementById("message").value = "";
});

// --- Leave chat ---
window.addEventListener("beforeunload", () => {
  navigator.sendBeacon(`${backendURL}/leave`, JSON.stringify({ user: currentUser }));
});

// --- Start polling ---
pollMessages();
pollOnlineUsers();
