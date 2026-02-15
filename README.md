# Luke Chat App

The Chat App is a real-time messaging web application that allows users to chat, react to messages, and see online users in real time. Built with **JavaScript**, **Node.js**, **WebSockets**, and **REST APIs**, it provides a responsive, interactive experience.

---

## Key Features

- Real-time messaging using **WebSockets**, with polling fallback for reliability  
- User registration and session persistence via local storage  
- Like and dislike reactions on messages  
- System notifications for user join/leave events  
- Online user count displayed dynamically  
- Mobile-friendly interface  

---

## Key Technologies

| Category       | Technology            | Description |
|----------------|---------------------|------------|
| Frontend       | JavaScript, HTML, CSS | Dynamic UI rendering and user interaction. |
| Backend (API)  | Node.js, Express.js  | RESTful endpoints for messaging, reactions, and user management. |
| Real-time      | WebSockets (Socket)  | Real-time message delivery with fallback polling. |
| Data Storage   | JSON/Backend API     | Message persistence and online user tracking. |
| Validation     | Local checks         | Ensures message content and username integrity. |

---

### Prerequisites

- **Node.js 20.x LTS**  
- A running backend (deployed or local)

### Configuration

The frontend connects to the backend using:

```javascript
const BACKEND_URL = "https://luke-chat-app-backend.hosting.codeyourfuture.io";
const API_BASE = `${BACKEND_URL}/api`;
const WS_URL = `${BACKEND_URL.replace("https://", "wss://").replace("http://", "ws://")}/ws`;
