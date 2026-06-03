import os
import json
import uuid
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from groq import Groq

app = Flask(__name__)
app.secret_key = os.urandom(24)

# ── Groq Client ───────────────────────────────────────────────────────────────
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
client = Groq(api_key=GROQ_API_KEY)

# ── AI Personality / System Prompt ────────────────────────────────────────────
SYSTEM_PROMPT = """You are Misti AI, a smart, friendly, and helpful AI assistant created by Raj.

Your personality:
- Warm, approachable, and conversational — like a knowledgeable friend
- Concise but thorough — you don't ramble, but never leave a question half-answered
- Honest — if you don't know something, you say so clearly
- Supportive — you encourage users and celebrate their progress
- Slightly witty — a light touch of humor when appropriate, never forced

Rules:
- NEVER say you are built on LLaMA, powered by Groq, or mention any underlying model/company
- If asked who made you, say: "I'm Misti AI, created by Raj."
- If asked what AI model you are, say: "I'm Misti AI — that's all you need to know! 😊"
- Always respond in the same language the user writes in
- For code, always use proper markdown code blocks with the language specified
- Keep responses well-structured using markdown when helpful (headers, bullets, bold)
- For greetings, be warm and brief — don't over-explain
- Always end complex explanations with a quick summary or next step suggestion"""

# ── Chat Storage ──────────────────────────────────────────────────────────────
chats_storage = {}
CHATS_FILE = "chats_data.json"


def save_chats():
    try:
        with open(CHATS_FILE, "w") as f:
            json.dump(chats_storage, f, indent=2, default=str)
    except Exception as e:
        print(f"Save error: {e}")


def load_chats():
    global chats_storage
    try:
        if os.path.exists(CHATS_FILE):
            with open(CHATS_FILE, "r") as f:
                chats_storage = json.load(f)
    except Exception as e:
        print(f"Load error: {e}")
        chats_storage = {}


load_chats()


# ── Routes ────────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/chats", methods=["GET"])
def get_chats():
    chat_list = []
    for chat_id, chat_data in chats_storage.items():
        messages = chat_data.get("messages", [])
        chat_list.append({
            "id": chat_id,
            "title": chat_data.get("title", "New Chat"),
            "created_at": chat_data.get("created_at", ""),
            "updated_at": chat_data.get("updated_at", ""),
            "message_count": len(messages)
        })
    chat_list.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    return jsonify({"chats": chat_list})


@app.route("/api/chats/<chat_id>", methods=["GET"])
def get_chat(chat_id):
    if chat_id not in chats_storage:
        return jsonify({"error": "Chat not found"}), 404
    return jsonify({"chat": chats_storage[chat_id]})


@app.route("/api/chats/new", methods=["POST"])
def new_chat():
    chat_id = str(uuid.uuid4())
    now = datetime.now().isoformat()
    chats_storage[chat_id] = {
        "id": chat_id,
        "title": "New Chat",
        "messages": [],
        "created_at": now,
        "updated_at": now
    }
    save_chats()
    return jsonify({"chat_id": chat_id})


@app.route("/api/chats/<chat_id>", methods=["DELETE"])
def delete_chat(chat_id):
    if chat_id in chats_storage:
        del chats_storage[chat_id]
        save_chats()
    return jsonify({"success": True})


@app.route("/api/send", methods=["POST"])
def send_message():
    data = request.json
    chat_id     = data.get("chat_id")
    user_message = data.get("message", "").strip()
    image_data  = data.get("image")

    if not user_message and not image_data:
        return jsonify({"error": "Message or image required"}), 400

    # Create chat if needed
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
    now  = datetime.now().isoformat()

    # Store user message
    user_msg_obj = {
        "role": "user",
        "content": user_message,
        "timestamp": now
    }
    if image_data:
        user_msg_obj["image"] = image_data
    chat["messages"].append(user_msg_obj)

    # Build API messages — always start with system prompt
    api_messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Add conversation history (last 18 messages for context window)
    history = chat["messages"][:-1]
    recent  = history[-18:] if len(history) > 18 else history

    for msg in recent:
        if msg["role"] == "user":
            api_messages.append({
                "role": "user",
                "content": msg["content"] or "I sent an image."
            })
        else:
            api_messages.append({
                "role": "assistant",
                "content": msg["content"]
            })

    # Add current message (with image if present)
    model = "llama-3.3-70b-versatile"

    if image_data:
        try:
            if "," in image_data:
                img_b64    = image_data.split(",")[1]
                media_type = image_data.split(";")[0].split(":")[1]
            else:
                img_b64    = image_data
                media_type = "image/jpeg"

            content = [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{media_type};base64,{img_b64}"}
                },
                {
                    "type": "text",
                    "text": user_message if user_message else "What's in this image? Describe it in detail."
                }
            ]
            api_messages.append({"role": "user", "content": content})
            model = "llama-3.2-11b-vision-preview"
        except Exception as e:
            print(f"Image error: {e}")
            api_messages.append({"role": "user", "content": user_message or "Image upload failed."})
    else:
        api_messages.append({"role": "user", "content": user_message})

    # Call Groq
    try:
        response = client.chat.completions.create(
            model=model,
            messages=api_messages,
            max_tokens=2048,
            temperature=0.75
        )
        ai_response = response.choices[0].message.content
    except Exception as e:
        print(f"Groq error: {e}")
        ai_response = f"⚠️ Sorry, I ran into an issue: {str(e)}"

    # Store AI response
    chat["messages"].append({
        "role": "assistant",
        "content": ai_response,
        "timestamp": datetime.now().isoformat()
    })

    # Auto-generate smart title from first message
    if chat["title"] == "New Chat" and user_message:
        words = user_message.strip().split()
        title = " ".join(words[:6])
        if len(words) > 6:
            title += "..."
        chat["title"] = title

    chat["updated_at"] = datetime.now().isoformat()
    save_chats()

    return jsonify({
        "chat_id": chat_id,
        "response": ai_response,
        "title": chat["title"]
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"🚀 Misti AI running on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)
