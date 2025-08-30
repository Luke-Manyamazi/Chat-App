const chatBox = document.getElementById("chatbox");
const chatForm = document.getElementById("chat-form");
const errorEl = document.getElementById("error");

const backendURL = "http://localhost:3001/api/messages";

// Function load messages from backend
async function loadMessages() {
    try {
        const response = await fetch(backendURL);
        const messages = await response.json();

        chatBox.innerHTML = "";
        messages.forEach(msg => {
            const msgDiv = document.createElement("div");
            msgDiv.className = "message";
            msgDiv.textContent = `${msg.user}: ${msg.text}`;
            chatBox.appendChild(msgDiv);
        })
    } catch (error) {
        console.error("Error loading messages:", error);
    }
}

// Handling sending message
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
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ user, text })
        });

        const data = await response.json();

        if (!response.ok) {
            errorEl.textContent = data.error || "Error sending message.";
        } else {
            errorEl.textContent = "";
            document.getElementById("message").value = "";
            loadMessages();
        }

        text.textContent = "";
        user.textContent = "";
    } catch (error) {
        console.error("Error sending message:", error);
    }
});

// Initial load
loadMessages();
chatBox.scrollTop = chatBox.scrollHeight;