import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

let messages = [];

// Getting all messages 
app.get("/api/messages", (req, res) => {
  res.json(messages);
});

// Posting a new message
app.post("/api/messages", (req, res) => {
  const  { user, text} = req.body;

  if (!user || !text) {
    return res.status(400).json({ error: "User and text are required" });
  }

  const newMessage = { 
    id: messages.length + 1,
    user, 
    text };
  messages.push(newMessage);
  res.status(201).json(newMessage);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
