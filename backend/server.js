const express = require("express");
const cors = require("cors");
const http = require("http");
const { server: WebSocketServer } = require("websocket");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const fs = require("fs");

const frontendPath =
  process.env.FRONTEND_PATH || path.join(__dirname, "../frontend");

if (fs.existsSync(path.join(frontendPath, "index.html"))) {
  app.use(express.static(frontendPath));
  app.get("/", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
  });
  app.get("/chat.html", (req, res) => {
    res.sendFile(path.join(frontendPath, "chat.html"));
  });
} else {
  app.get("/", (req, res) => {
    res.json({ message: "Chat App API is running" });
  });
}

let messages = [];
let onlineUsers = new Set();
let wsClients = new Set();
let pollingCallbacks = [];

function broadcastWS(data, type = "new-message") {
  const msg = JSON.stringify({ type, ...data });
  wsClients.forEach((conn) => {
    try {
      if (conn.connected) conn.send(msg);
    } catch (err) {
      wsClients.delete(conn);
    }
  });
}

function broadcastPolling(data) {
  while (pollingCallbacks.length) {
    pollingCallbacks.pop()([data]);
  }
}

function createSystemMessage(text) {
  const msg = {
    id: messages.length + 1,
    type: "system",
    text,
    timestamp: new Date().toISOString(),
    likes: 0,
    dislikes: 0,
  };
  messages.push(msg);
  broadcastWS(msg);
  broadcastPolling(msg);
  return msg;
}

function getMessageById(id) {
  return messages.find((m) => m.id === id);
}

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/online-users", (req, res) => {
  res.json({
    onlineUsers: Array.from(onlineUsers),
    count: onlineUsers.size,
  });
});

app.get("/api/messages", (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const newMessages = messages.filter((m) => m.id > since);

  if (newMessages.length) return res.json(newMessages);

  let responded = false;
  const cb = (data) => {
    if (!responded) {
      responded = true;
      res.json(data);
    }
  };

  pollingCallbacks.push(cb);

  setTimeout(() => {
    if (!responded) cb([]);
  }, 25000);
});

app.post("/api/messages", (req, res) => {
  const { user, text } = req.body;
  if (!user || !text) {
    return res.status(400).json({ error: "User and text required" });
  }

  const msg = {
    id: messages.length + 1,
    user,
    text,
    timestamp: new Date().toISOString(),
    likes: 0,
    dislikes: 0,
    type: "message",
  };

  messages.push(msg);
  res.status(201).json(msg);

  broadcastWS(msg);
  broadcastPolling(msg);
});

function handleUserAction(req, res, action) {
  const { user } = req.body;
  if (!user) return res.status(400).json({ error: "User required" });

  if (action === "join") {
    onlineUsers.add(user);
    createSystemMessage(`${user} has joined the chat`);
  }

  if (action === "leave") {
    onlineUsers.delete(user);
    createSystemMessage(`${user} has left the chat`);
  }

  res.json({
    onlineUsers: Array.from(onlineUsers),
    count: onlineUsers.size,
  });
}

app.post("/api/join", (req, res) => handleUserAction(req, res, "join"));
app.post("/api/leave", (req, res) => handleUserAction(req, res, "leave"));

app.post("/api/react", (req, res) => {
  const { id, type } = req.body;
  const msg = getMessageById(id);

  if (!msg) return res.status(404).json({ error: "Message not found" });

  if (type === "like") msg.likes++;
  if (type === "dislike") msg.dislikes++;

  res.json(msg);
  broadcastWS(msg, "update");
  broadcastPolling(msg);
});

const server = http.createServer(app);
const wsServer = new WebSocketServer({
  httpServer: server,
  autoAcceptConnections: false,
});

wsServer.on("request", (req) => {
  const conn = req.accept(null, req.origin);
  wsClients.add(conn);

  try {
    conn.send(
      JSON.stringify({
        type: "init",
        messages: messages.slice(-30),
        onlineUsers: Array.from(onlineUsers),
      })
    );
  } catch (err) {
    wsClients.delete(conn);
    return;
  }

  conn.on("message", (msg) => {
    if (msg.type !== "utf8") return;

    try {
      const data = JSON.parse(msg.utf8Data);

      if (data.type === "message") {
        const newMsg = {
          id: messages.length + 1,
          user: data.user,
          text: data.text,
          timestamp: new Date().toISOString(),
          likes: 0,
          dislikes: 0,
          type: "message",
        };

        messages.push(newMsg);
        broadcastWS(newMsg);
        broadcastPolling(newMsg);
      }

      if (data.type === "react") {
        const m = getMessageById(data.id);
        if (!m) return;

        if (data.reaction === "like") m.likes++;
        if (data.reaction === "dislike") m.dislikes++;

        broadcastWS(m, "update");
        broadcastPolling(m);
      }

      if (data.type === "join") {
        onlineUsers.add(data.user);
        createSystemMessage(`${data.user} has joined the chat`);
      }

      if (data.type === "leave") {
        onlineUsers.delete(data.user);
        createSystemMessage(`${data.user} has left the chat`);
      }
    } catch (err) {
      // Ignore parse errors
    }
  });

  conn.on("close", () => {
    wsClients.delete(conn);
  });

  conn.on("error", () => {
    wsClients.delete(conn);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
