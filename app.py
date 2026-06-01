import os
import json
import base64
import uuid
from datetime import datetime
from flask import Flask, render_template, request, jsonify, session
from groq import Groq

app = Flask(__name__)
app.secret_key = os.urandom(24)

# Initialize Groq client - set your API key here or via environment variable
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
client = Groq(api_key=GROQ_API_KEY)

# In-memory storage for chats (resets on server restart)
# For persistence across restarts, you could use a JSON file
chats_storage = {}


def save_chats_to_file():
    """Save chats to a JSON file for persistence."""
    try:
        with open("chats_data.json", "w") as f:
            json.dump(chats_storage, f, indent=2, default=str)
    except Exception as e:
        print(f"Error saving chats: {e}")


def load_chats_from_file():
    """Load chats from JSON file on startup."""
    global chats_storage
    try:
        if os.path.exists("chats_data.json"):
            with open("chats_data.json", "r") as f:
                chats_storage = json.load(f)
    except Exception as e:
        print(f"Error loading chats: {e}")
        chats_storage = {}


# Load existing chats on startup
load_chats_from_file()


@app.route("/")
def index():
    """Serve the main chat page."""
    return render_template("index.html")


@app.route("/api/chats", methods=["GET"])
def get_chats():
    """Get all chat sessions (titles only for sidebar)."""
    chat_list = []
    for chat_id, chat_data in chats_storage.items():
        chat_list.append({
            "id": chat_id,
            "title": chat_data.get("title", "New Chat"),
            "created_at": chat_data.get("created_at", ""),
            "updated_at": chat_data.get("updated_at", ""),
            "message_count": len(chat_data.get("messages", []))
        })
    # Sort by updated_at descending
    chat_list.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    return jsonify({"chats": chat_list})


@app.route("/api/chats/<chat_id>", methods=["GET"])
def get_chat(chat_id):
    """Get a specific chat's messages."""
    if chat_id not in chats_storage:
        return jsonify({"error": "Chat not found"}), 404
    return jsonify({"chat": chats_storage[chat_id]})


@app.route("/api/chats/new", methods=["POST"])
def new_chat():
    """Create a new chat session."""
    chat_id = str(uuid.uuid4())
    now = datetime.now().isoformat()
    chats_storage[chat_id] = {
        "id": chat_id,
        "title": "New Chat",
        "messages": [],
        "created_at": now,
        "updated_at": now
    }
    save_chats_to_file()
    return jsonify({"chat_id": chat_id})


@app.route("/api/chats/<chat_id>", methods=["DELETE"])
def delete_chat(chat_id):
    """Delete a chat session."""
    if chat_id in chats_storage:
        del chats_storage[chat_id]
        save_chats_to_file()
    return jsonify({"success": True})


@app.route("/api/send", methods=["POST"])
def send_message():
    """Send a message and get AI response."""
    data = request.json
    chat_id = data.get("chat_id")
    user_message = data.get("message", "").strip()
    image_data = data.get("image")  # base64 image string if attached

    if not user_message and not image_data:
        return jsonify({"error": "Message or image required"}), 400

    # Create new chat if chat_id not provided or not found
    if not chat_id or chat_id not in chats_storage:
        chat_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        chats_storage[chat_id] = {
            "id": chat_id,
            "title": "New Chat",
            "messages": [],
            "created_at": now,
            "updated_at": now
        }

    chat = chats_storage[chat_id]
    now = datetime.now().isoformat()

    # Build the user message for storage
    user_msg_obj = {
        "role": "user",
        "content": user_message,
        "timestamp": now
    }
    if image_data:
        user_msg_obj["image"] = image_data  # store thumbnail reference

    chat["messages"].append(user_msg_obj)

    # Build messages for Groq API
    api_messages = []

    # Add conversation history (last 20 messages for context)
    history = chat["messages"][:-1]  # exclude the one we just added
    recent_history = history[-19:] if len(history) > 19 else history

    for msg in recent_history:
        if msg["role"] == "user":
            if msg.get("image"):
                # Previous image messages - just include text
                api_messages.append({
                    "role": "user",
                    "content": msg["content"] or "I sent an image."
                })
            else:
                api_messages.append({
                    "role": "user",
                    "content": msg["content"]
                })
        else:
            api_messages.append({
                "role": "assistant",
                "content": msg["content"]
            })

    # Add current user message
    if image_data:
        try:
            # Extract base64 data (remove data:image/...;base64, prefix)
            if "," in image_data:
                img_b64 = image_data.split(",")[1]
                media_type = image_data.split(";")[0].split(":")[1]
            else:
                img_b64 = image_data
                media_type = "image/jpeg"

            current_msg_content = [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{media_type};base64,{img_b64}"
                    }
                }
            ]
            if user_message:
                current_msg_content.append({
                    "type": "text",
                    "text": user_message
                })
            else:
                current_msg_content.append({
                    "type": "text",
                    "text": "What's in this image? Please describe it."
                })

            api_messages.append({
                "role": "user",
                "content": current_msg_content
            })
            # Use vision model for image
            model = "llama-3.2-11b-vision-preview"
        except Exception as e:
            print(f"Image processing error: {e}")
            api_messages.append({
                "role": "user",
                "content": user_message or "I sent an image but there was an error."
            })
            model = "llama-3.3-70b-versatile"
    else:
        api_messages.append({
            "role": "user",
            "content": user_message
        })
        model = "llama-3.3-70b-versatile"

    # Call Groq API
    try:
        response = client.chat.completions.create(
            model=model,
            messages=api_messages,
            max_tokens=2048,
            temperature=0.7
        )
        ai_response = response.choices[0].message.content

    except Exception as e:
        print(f"Groq API error: {e}")
        ai_response = f"Sorry, I encountered an error: {str(e)}"

    # Store AI response
    ai_msg_obj = {
        "role": "assistant",
        "content": ai_response,
        "timestamp": datetime.now().isoformat()
    }
    chat["messages"].append(ai_msg_obj)

    # Update chat title from first user message if still "New Chat"
    if chat["title"] == "New Chat" and user_message:
        title = user_message[:40] + ("..." if len(user_message) > 40 else "")
        chat["title"] = title

    chat["updated_at"] = datetime.now().isoformat()
    save_chats_to_file()

    return jsonify({
        "chat_id": chat_id,
        "response": ai_response,
        "title": chat["title"]
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
