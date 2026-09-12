# Luke Chat App

> A real-time messaging web application built around WebSockets and a Node.js API.

Luke Chat App is a full-stack messaging project focused on real-time communication, interactive user presence, and resilient client/server communication.

## Features

- Real-time messaging with WebSockets
- Polling fallback for improved resilience
- User registration and session persistence
- Message reactions
- Join and leave notifications
- Live online-user count
- Responsive, mobile-friendly interface
- REST API for application operations

## Architecture

```text
Browser client
     ↓
REST API + WebSocket connection
     ↓
Node.js / Express backend
     ↓
Message and user state
```

The client uses the WebSocket channel for live events while the HTTP API supports application operations and fallback communication.

## Technology

| Area | Technology |
|---|---|
| Frontend | JavaScript, HTML, CSS |
| Backend | Node.js, Express.js |
| Real-time | WebSockets |
| Communication | REST API |
| Runtime | Node.js 20+ |

## Getting started

Install the project dependencies and start the backend using the repository's existing npm scripts.

```bash
npm install
npm start
```

The frontend must be configured to point at the running backend. Keep deployment URLs and environment-specific configuration outside the application source when deploying to another environment.

## Engineering focus

This project demonstrates real-time web application design, WebSocket communication, REST API integration, client-side state handling, graceful fallback strategies, and responsive frontend development.

## Project context

Built as a practical full-stack application while developing software engineering skills through CodeYourFuture.
