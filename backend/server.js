// --- Imports ---
const express = require("express");
const cors = require("cors");
const http = require("http");
const { server: WebSocketServer } = require("websocket");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- State ---
let messages = [];
let callbacksForNewMessages = [];
let onlineUsers = new Set();
let wsClients = [];

// --- Helper (polling broadcast) ---
function broadcastMessage(newMessage) {
  messages.push(newMessage);

  while (callbacksForNewMessages.length > 0) {
    const callback = callbacksForNewMessages.pop();
    callback([newMessage]);
  }
}

// --- Express routes (polling) ---
app.get("/api/online-users", (req, res) => {
  res.json({
    onlineUsers: Array.from(onlineUsers),
    count: onlineUsers.size,
  });
});

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

    setTimeout(() => {
      callback([]);
    }, 25000);
  } else {
    res.json(messagesToSend);
  }
});

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
  broadcastWS({ type: "new-message", message: newMessage });
});

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
  broadcastWS({ type: "new-message", message: systemMsg });

  res.json({
    onlineUsers: Array.from(onlineUsers),
    count: onlineUsers.size,
  });
}

app.post("/api/join", (req, res) => handleUserAction(req, res, "join"));
app.post("/api/leave", (req, res) => handleUserAction(req, res, "leave"));

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
  broadcastMessage(msg);
  broadcastWS({ type: "update", message: msg });
});

// --- Wrap Express in HTTP + WebSocket ---
const server = http.createServer(app);
const wsServer = new WebSocketServer({ httpServer: server });

wsServer.on("request", (request) => {
  const connection = request.accept(null, request.origin);
  wsClients.push(connection);

  connection.sendUTF(JSON.stringify({ type: "init", messages }));

  connection.on("message", (msg) => {
    const data = JSON.parse(msg.utf8Data);

    if (data.type === "message") {
      const newMessage = {
        id: messages.length + 1,
        user: data.user,
        text: data.text,
        timestamp: new Date().toISOString(),
        likes: 0,
        dislikes: 0,
        type: "message",
      };
      messages.push(newMessage);
      broadcastWS({ type: "new-message", message: newMessage });
    }

    if (data.type === "react") {
      const m = messages.find((m) => m.id === data.id);
      if (!m) return;
      if (data.reaction === "like") m.likes++;
      if (data.reaction === "dislike") m.dislikes++;
      broadcastWS({ type: "update", message: m });
    }
  });

  connection.on("close", () => {
    wsClients = wsClients.filter((c) => c !== connection);
  });
});

function broadcastWS(data) {
  const msg = JSON.stringify(data);
  wsClients.forEach((c) => c.sendUTF(msg));
}

// --- Start server ---
const PORT = process.env.PORT || 3001;
console.log("About to start server...");
server.listen(PORT, () =>
  console.log(`Server running (polling + WS) on port ${PORT}`)
);
