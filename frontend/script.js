const chatBox = document.getElementById("chatbox");
const chatForm = document.getElementById("chat-form");
const errorEl = document.getElementById("error");

const backendURL = "https://luke-chat-app-backend.hosting.codeyourfuture.io/api/messages";

let lastId = 0; // track the latest message ID we’ve seen

// --- Long polling function ---
async function pollMessages() {
    try {
        const response = await fetch(`${backendURL}?since=${lastId}`);
        const messages = await response.json();

        if (messages.length > 0) {
            messages.forEach(msg => {
                const msgDiv = document.createElement("div");
                msgDiv.className = "message";
                msgDiv.textContent = `${msg.user}: ${msg.text}`;
                chatBox.appendChild(msgDiv);
                lastId = msg.id; // update latest message ID
            });

            chatBox.scrollTop = chatBox.scrollHeight;
        }

        // When response finishes (even if empty), immediately poll again
        pollMessages();
    } catch (error) {
        console.error("Polling error:", error);
        // Retry after 5 seconds if something goes wrong (like server restart)
        setTimeout(pollMessages, 5000);
    }
}

// --- Handling sending message ---
chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const user = document.getElementById("user").value.trim();
    const text = document.getElementById("message").value.trim();

    if (!user || !text) {
        errorEl.textContent = "Please enter both a user and a message.";
        return;
    }

    try {
        const response = await fetch(backendURL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user, text })
        });

        const data = await response.json();

        if (!response.ok) {
            errorEl.textContent = data.error || "Error sending message.";
        } else {
            errorEl.textContent = "";
            document.getElementById("message").value = "";
        }
    } catch (error) {
        console.error("Error sending message:", error);
    }
});

// --- Start long-polling when page loads ---
pollMessages();
