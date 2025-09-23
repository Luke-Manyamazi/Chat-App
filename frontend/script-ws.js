const chatBox = document.getElementById("chatbox");
const chatForm = document.getElementById("chat-form");
const leaveBtn = document.getElementById("leave");

let currentUser = prompt("Enter your name:");
let lastId = 0;

// --- Join via polling API (for user list) ---
fetch("https://luke-quote-app-backend.hosting.codeyourfuture.io/api/join", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ user: currentUser }),
});

// --- Connect WebSocket ---
const ws = new WebSocket("wss://luke-quote-app-backend.hosting.codeyourfuture.io");

ws.onopen = () => console.log("Connected via WebSocket");

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "init") {
    data.messages.forEach(renderMessage);
  }

  if (data.type === "new-message") {
    renderMessage(data.message);
  }

  if (data.type === "update") {
    updateMessage(data.message);
  }
};

// --- Send message ---
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = document.getElementById("message").value.trim();
  if (!text) return;

  ws.send(JSON.stringify({ type: "message", user: currentUser, text }));
  document.getElementById("message").value = "";
});

// --- React (like/dislike) ---
function react(id, reaction) {
  ws.send(JSON.stringify({ type: "react", id, reaction }));
}

// --- Render ---
function renderMessage(msg) {
  let existing = document.getElementById("msg-" + msg.id);
  if (existing) return updateMessage(msg);

  const div = document.createElement("div");
  div.id = "msg-" + msg.id;
  div.className = "message";

  if (msg.type === "system") {
    div.innerHTML = `<em>${msg.text}</em>`;
  } else {
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
  lastId = msg.id;
}

function updateMessage(msg) {
  const div = document.getElementById("msg-" + msg.id);
  if (div) {
    div.querySelector(".like-count").textContent = msg.likes;
    div.querySelector(".dislike-count").textContent = msg.dislikes;
  }
}

// --- Leave ---
leaveBtn.addEventListener("click", () => {
  fetch("http://localhost:3001/api/leave", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: currentUser }),
  });
  ws.close();
  alert("You left the chat!");
});
