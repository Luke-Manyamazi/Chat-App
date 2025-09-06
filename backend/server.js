import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

let messages = [];
let callbacksForNewMessages = []; // stores waiting callbacks

// GET messages (long-polling support)
app.get("/api/messages", (req, res) => {
  // Optionally: allow client to pass ?since=<lastMessageId>
  const since = parseInt(req.query.since) || 0;
  const messagesToSend = messages.filter((msg) => msg.id > since);

  if (messagesToSend.length === 0) {
    // No new messages → hold connection open
    callbacksForNewMessages.push((value) => res.json(value));

    // Optional: timeout after 25s to avoid hanging forever
    setTimeout(() => {
      const index = callbacksForNewMessages.indexOf(res.json);
      if (index !== -1) {
        callbacksForNewMessages.splice(index, 1);
        res.json([]); // return empty response on timeout
      }
    }, 25000);
  } else {
    // New messages available immediately
    res.json(messagesToSend);
  }
});

// POST new message
app.post("/api/messages", (req, res) => {
  const { user, text } = req.body;

  if (!user || !text) {
    return res.status(400).json({ error: "User and text are required" });
  }

  const newMessage = {
    id: messages.length + 1,
    user,
    text,
  };
  messages.push(newMessage);

  // Respond immediately to sender
  res.status(201).json(newMessage);

  // Notify waiting clients
  while (callbacksForNewMessages.length > 0) {
    const callback = callbacksForNewMessages.pop();
    callback([newMessage]);
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
