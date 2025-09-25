// --- Imports ---
const express = require("express");
const cors = require("cors");
const http = require("http");
const { server: WebSocketServer } = require("websocket");
const path = require("path");

const app = express();

// --- CORS Configuration ---
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow all origins in development
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // In production, restrict to specific origins
    const allowedOrigins = ['https://yourdomain.com']; // Change this for production
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

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
      if (!responded) {
        responded = true;
        callback([]);
      }
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
  messages.push(systemMsg);
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
  broadcastWS({ type: "update", message: msg });
});

// Serve static files from real frontend folder
app.use(express.static(path.join(__dirname, '../frontend')));

// Route for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});


// Route for WebSocket version
app.get('/ws', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'ws.html'));
});

// --- Wrap Express in HTTP + WebSocket ---
const server = http.createServer(app);
const wsServer = new WebSocketServer({ 
  httpServer: server,
  autoAcceptConnections: false
});

wsServer.on("request", (request) => {
  // Check origin in development - allow all
  if (process.env.NODE_ENV !== 'production') {
    const connection = request.accept(null, request.origin);
    console.log("WebSocket connection accepted from:", request.origin);
    handleWebSocketConnection(connection);
  } else {
    // In production, check against allowed origins
    const allowedOrigins = ['https://yourdomain.com']; // Change for production
    if (allowedOrigins.includes(request.origin)) {
      const connection = request.accept(null, request.origin);
      handleWebSocketConnection(connection);
    } else {
      request.reject();
      console.log('Connection from origin ' + request.origin + ' rejected.');
    }
  }
});

function handleWebSocketConnection(connection) {
  wsClients.push(connection);

  // Send initial data
  connection.send(JSON.stringify({ 
    type: "init", 
    messages,
    onlineUsers: Array.from(onlineUsers)
  }));

  connection.on("message", (msg) => {
    if (msg.type === 'utf8') {
      try {
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
          broadcastMessage(newMessage);
          broadcastWS({ type: "new-message", message: newMessage });
        }

        if (data.type === "react") {
          const m = messages.find((m) => m.id === data.id);
          if (!m) return;
          if (data.reaction === "like") m.likes++;
          if (data.reaction === "dislike") m.dislikes++;
          broadcastMessage(m);
          broadcastWS({ type: "update", message: m });
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    }
  });

  connection.on("close", () => {
    console.log("WebSocket connection closed");
    wsClients = wsClients.filter((c) => c !== connection);
  });

  connection.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
}

function broadcastWS(data) {
  const msg = JSON.stringify(data);
  wsClients.forEach((c) => {
    if (c.connected) {
      try {
        c.send(msg);
      } catch (error) {
        console.error("Error sending WebSocket message:", error);
      }
    }
  });
}

// --- Start server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Polling version: http://localhost:${PORT}`);
  console.log(`WebSocket version: http://localhost:${PORT}/ws`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please use a different port.`);
    process.exit(1);
  } else {
    console.error('Server error:', error);
  }
});