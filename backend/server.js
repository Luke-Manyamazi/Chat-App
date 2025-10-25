const express = require("express");
const cors = require("cors");
const http = require("http");
const { server: WebSocketServer } = require("websocket");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../frontend")));

// --- Chat State ---
let messages = [];
let onlineUsers = new Set();
let wsClients = [];
let pollingCallbacks = [];

// --- Helper Functions ---
function broadcastToPollingAndWS(data, type = "new-message") {
  const msg = JSON.stringify({ type, ...data });

  wsClients.forEach(c => c.connected && c.send(msg));
  while (pollingCallbacks.length) {
    const cb = pollingCallbacks.pop();
    cb([data]);
  }
}

function createSystemMessage(text) {
  const msg = { id: messages.length + 1, type: "system", text, timestamp: new Date().toISOString() };
  messages.push(msg);
  broadcastToPollingAndWS(msg);
  return msg;
}

function getMessageById(id) { return messages.find(m => m.id === id); }

// --- Routes ---
app.get("/api/online-users", (req, res) => res.json({ onlineUsers: Array.from(onlineUsers), count: onlineUsers.size }));

app.get("/api/messages", (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const msgs = messages.filter(m => m.id > since);

  if (msgs.length) return res.json(msgs);

  let responded = false;
  const cb = (value) => { if (!responded) { responded = true; res.json(value); }};
  pollingCallbacks.push(cb);
  setTimeout(() => { if (!responded) cb([]); }, 25000);
});

app.post("/api/messages", (req, res) => {
  const { user, text } = req.body;
  if (!user || !text) return res.status(400).json({ error: "User and text required" });

  const newMsg = { id: messages.length + 1, user, text, timestamp: new Date().toISOString(), likes: 0, dislikes: 0, type: "message" };
  messages.push(newMsg);
  res.status(201).json(newMsg);
  broadcastToPollingAndWS(newMsg);
});

function handleUserAction(req, res, action) {
  const { user } = req.body;
  if (!user) return res.status(400).json({ error: "User required" });
  action === "join" ? onlineUsers.add(user) : onlineUsers.delete(user);
  createSystemMessage(`${user} ${action}ed the chat`);
  res.json({ onlineUsers: Array.from(onlineUsers), count: onlineUsers.size });
}
app.post("/api/join", (req, res) => handleUserAction(req, res, "join"));
app.post("/api/leave", (req, res) => handleUserAction(req, res, "leave"));

app.post("/api/react", (req, res) => {
  const { id, type } = req.body;
  if (!id || !type) return res.status(400).json({ error: "id and type required" });
  const msg = getMessageById(id);
  if (!msg) return res.status(404).json({ error: "Message not found" });
  if (type === "like") msg.likes++; if (type === "dislike") msg.dislikes++;
  res.json(msg);
  broadcastToPollingAndWS(msg, "update");
});

// --- WebSocket ---
const server = http.createServer(app);
const wsServer = new WebSocketServer({ httpServer: server, autoAcceptConnections: false });

wsServer.on("request", (req) => {
  const conn = req.accept(null, req.origin);
  wsClients.push(conn);
  conn.send(JSON.stringify({ type: "init", messages, onlineUsers: Array.from(onlineUsers) }));

  conn.on("message", (msg) => {
    if (msg.type !== "utf8") return;
    try {
      const data = JSON.parse(msg.utf8Data);
      if (data.type === "message") {
        const newMsg = { id: messages.length+1, user: data.user, text: data.text, timestamp: new Date().toISOString(), likes:0, dislikes:0, type:"message" };
        messages.push(newMsg);
        broadcastToPollingAndWS(newMsg);
      }
      if (data.type === "react") {
        const m = getMessageById(data.id); if (!m) return;
        if (data.reaction === "like") m.likes++; if (data.reaction === "dislike") m.dislikes++;
        broadcastToPollingAndWS(m, "update");
      }
      if (data.type === "join") {
        onlineUsers.add(data.user);
        createSystemMessage(`${data.user} joined the chat`);
      }
    } catch (err) { console.error("WS message parse error:", err); }
  });

  conn.on("close", () => wsClients = wsClients.filter(c => c !== conn));
  conn.on("error", console.error);
});

// --- Start Server ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
