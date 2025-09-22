const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 

let messages = [];
let callbacksForNewMessages = [];
let onlineUsers = new Set();

// --- Helper to broadcast messages ---
function broadcastMessage(newMessage) {
  messages.push(newMessage);

  while (callbacksForNewMessages.length > 0) {
    const callback = callbacksForNewMessages.pop();
    callback([newMessage]);
  }
}

// --- Get online users ---
app.get("/api/online-users", (req, res) => {
  res.json({
    onlineUsers: Array.from(onlineUsers),
    count: onlineUsers.size,
  });
});

// --- Get messages (long-polling) ---
app.get("/api/messages", (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const messagesToSend = messages.filter((msg) => msg.id > since);

  if (messagesToSend.length === 0) {
    let responded = false;

    const callback = (value) => {
      if (!responded) {
        responded = true;
        res.json(value);
      }
    };

    callbacksForNewMessages.push(callback);

    // Timeout fallback
    setTimeout(() => {
      callback([]); 
    }, 25000);
  } else {
    res.json(messagesToSend);
  }
});


// --- Post new message ---
app.post("/api/messages", (req, res) => {
  const { user, text } = req.body || {}; 
  if (!user || !text) {
    return res.status(400).json({ error: "User and text required" });
  }

  const newMessage = {
    id: messages.length + 1,
    user,
    text,
    timestamp: new Date().toISOString(),
    likes: 0,
    dislikes: 0,
    type: "message",
  };

  res.status(201).json(newMessage);
  broadcastMessage(newMessage);
});

// --- Reusable user handler (join/leave) ---
function handleUserAction(req, res, action) {
  const { user } = req.body || {}; 
  if (!user) return res.status(400).json({ error: "User required" });

  if (action === "join") {
    onlineUsers.add(user);
  } else if (action === "leave") {
    onlineUsers.delete(user);
  }

  const systemMsg = {
    id: messages.length + 1,
    type: "system",
    text: `${user} ${action}ed the chat`,
    timestamp: new Date().toISOString(),
  };
  broadcastMessage(systemMsg);

  res.json({
    onlineUsers: Array.from(onlineUsers),
    count: onlineUsers.size,
  });
}

// --- Routes for join/leave using the helper ---
app.post("/api/join", (req, res) => handleUserAction(req, res, "join"));
app.post("/api/leave", (req, res) => handleUserAction(req, res, "leave"));

// --- React (like/dislike) ---
app.post("/api/react", (req, res) => {
  const { id, type } = req.body || {}; 
  if (!id || !type) {
    return res.status(400).json({ error: "id and type required" });
  }

  const msg = messages.find((m) => m.id === id);
  if (!msg) return res.status(404).json({ error: "Message not found" });

  if (type === "like") msg.likes++;
  if (type === "dislike") msg.dislikes++;

  res.json(msg);
  broadcastMessage(msg); // update clients
});

const PORT = process.env.PORT || 3001;
console.log("About to start server...");
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
console.log("If you see this, Node did not crash yet.");
