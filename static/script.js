/* ==========================================
   VERTEX AI CHATBOT — script.js
   ========================================== */

"use strict";

// ── State ────────────────────────────────────────────────────────────────────
let currentChatId  = null;
let attachedImage  = null;   // { dataUrl, name, size }
let isLoading      = false;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const hamburgerBtn      = document.getElementById("hamburgerBtn");
const sidebar           = document.getElementById("sidebar");
const sidebarOverlay    = document.getElementById("sidebarOverlay");
const sidebarClose      = document.getElementById("sidebarClose");
const newChatBtn        = document.getElementById("newChatBtn");
const chatHistory       = document.getElementById("chatHistory");
const historyEmpty      = document.getElementById("historyEmpty");

const welcomeScreen     = document.getElementById("welcomeScreen");
const messagesContainer = document.getElementById("messagesContainer");
const typingIndicator   = document.getElementById("typingIndicator");
const chatArea          = document.getElementById("chatArea");

const messageInput      = document.getElementById("messageInput");
const sendBtn           = document.getElementById("sendBtn");
const imageInput        = document.getElementById("imageInput");

const imagePreviewBar   = document.getElementById("imagePreviewBar");
const imagePreviewThumb = document.getElementById("imagePreviewThumb");
const imagePreviewName  = document.getElementById("imagePreviewName");
const imagePreviewSize  = document.getElementById("imagePreviewSize");
const imageRemoveBtn    = document.getElementById("imageRemoveBtn");


// ── Sidebar ──────────────────────────────────────────────────────────────────
function openSidebar() {
  sidebar.classList.add("open");
  sidebarOverlay.classList.add("active");
  document.body.style.overflow = "hidden";
  loadChatHistory();
}
function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("active");
  document.body.style.overflow = "";
}

hamburgerBtn.addEventListener("click", openSidebar);
sidebarClose.addEventListener("click", closeSidebar);
sidebarOverlay.addEventListener("click", closeSidebar);


// ── Chat History ─────────────────────────────────────────────────────────────
async function loadChatHistory() {
  try {
    const res  = await fetch("/api/chats");
    const data = await res.json();
    renderChatHistory(data.chats || []);
  } catch (e) {
    console.error("Failed to load chat history", e);
  }
}

function renderChatHistory(chats) {
  // Clear existing items (but keep the empty-state div)
  Array.from(chatHistory.querySelectorAll(".chat-history-item"))
       .forEach(el => el.remove());

  if (chats.length === 0) {
    historyEmpty.style.display = "flex";
    return;
  }
  historyEmpty.style.display = "none";

  chats.forEach(chat => {
    const item = document.createElement("div");
    item.className = "chat-history-item" + (chat.id === currentChatId ? " active" : "");
    item.dataset.chatId = chat.id;

    const title = document.createElement("span");
    title.className = "chat-item-title";
    title.textContent = chat.title || "New Chat";

    const del = document.createElement("button");
    del.className = "chat-item-delete";
    del.textContent = "🗑";
    del.title = "Delete chat";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      await deleteChat(chat.id);
    });

    item.appendChild(title);
    item.appendChild(del);
    item.addEventListener("click", () => loadChat(chat.id));
    chatHistory.appendChild(item);
  });
}

async function loadChat(chatId) {
  try {
    const res  = await fetch(`/api/chats/${chatId}`);
    const data = await res.json();
    if (data.error) return;

    currentChatId = chatId;
    clearMessages();
    welcomeScreen.style.display = "none";

    const messages = data.chat.messages || [];
    messages.forEach(msg => renderMessage(msg.role, msg.content, msg.timestamp, msg.image));

    closeSidebar();
    scrollToBottom();
  } catch (e) {
    console.error("Failed to load chat", e);
  }
}

async function deleteChat(chatId) {
  try {
    await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
    if (chatId === currentChatId) {
      startNewChat();
    }
    loadChatHistory();
  } catch (e) {
    console.error("Failed to delete chat", e);
  }
}


// ── New Chat ─────────────────────────────────────────────────────────────────
function startNewChat() {
  currentChatId = null;
  clearMessages();
  welcomeScreen.style.display = "flex";
  closeSidebar();
  messageInput.focus();
}

newChatBtn.addEventListener("click", startNewChat);

function clearMessages() {
  messagesContainer.innerHTML = "";
  clearAttachedImage();
}


// ── Message Input ─────────────────────────────────────────────────────────────
messageInput.addEventListener("input", () => {
  // Auto-resize
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + "px";
  // Enable/disable send
  updateSendBtn();
});

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) sendMessage();
  }
});

function updateSendBtn() {
  const hasText  = messageInput.value.trim().length > 0;
  const hasImage = attachedImage !== null;
  sendBtn.disabled = isLoading || (!hasText && !hasImage);
}

sendBtn.addEventListener("click", sendMessage);


// ── Image Attach ──────────────────────────────────────────────────────────────
imageInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Validate: images only (already restricted by accept="image/*" but double check)
  if (!file.type.startsWith("image/")) {
    showToast("Only image files are allowed!");
    imageInput.value = "";
    return;
  }
  // 10MB limit
  if (file.size > 10 * 1024 * 1024) {
    showToast("Image must be under 10MB");
    imageInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = (ev) => {
    attachedImage = {
      dataUrl: ev.target.result,
      name:    file.name,
      size:    file.size
    };
    showImagePreview();
    updateSendBtn();
  };
  reader.readAsDataURL(file);
  imageInput.value = ""; // allow re-selecting same file
});

function showImagePreview() {
  if (!attachedImage) return;
  imagePreviewThumb.src  = attachedImage.dataUrl;
  imagePreviewName.textContent = attachedImage.name;
  imagePreviewSize.textContent = formatBytes(attachedImage.size);
  imagePreviewBar.style.display = "block";
}

function clearAttachedImage() {
  attachedImage = null;
  imagePreviewBar.style.display = "none";
  imagePreviewThumb.src = "";
  updateSendBtn();
}

imageRemoveBtn.addEventListener("click", clearAttachedImage);


// ── Send Message ─────────────────────────────────────────────────────────────
async function sendMessage() {
  const text = messageInput.value.trim();
  if (isLoading || (!text && !attachedImage)) return;

  isLoading = true;
  updateSendBtn();

  // Hide welcome
  welcomeScreen.style.display = "none";

  // Snapshot image before clearing
  const imgSnapshot = attachedImage ? { ...attachedImage } : null;

  // Render user bubble
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  renderMessage("user", text, now, imgSnapshot ? imgSnapshot.dataUrl : null);

  // Clear input
  messageInput.value = "";
  messageInput.style.height = "auto";
  clearAttachedImage();

  // Show typing
  typingIndicator.style.display = "flex";
  scrollToBottom();

  try {
    const payload = {
      chat_id: currentChatId,
      message: text,
      image:   imgSnapshot ? imgSnapshot.dataUrl : null
    };

    const res  = await fetch("/api/send", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload)
    });
    const data = await res.json();

    typingIndicator.style.display = "none";

    if (data.error) {
      renderMessage("ai", `⚠️ Error: ${data.error}`, now);
    } else {
      currentChatId = data.chat_id;
      const aiTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      renderMessage("ai", data.response, aiTime);
    }
  } catch (err) {
    typingIndicator.style.display = "none";
    renderMessage("ai", "⚠️ Network error. Please check your connection.", now);
    console.error("Send error:", err);
  }

  isLoading = false;
  updateSendBtn();
  scrollToBottom();
}


// ── Render Message ────────────────────────────────────────────────────────────
function renderMessage(role, text, timestamp, imageUrl) {
  const row = document.createElement("div");
  row.className = `message-row ${role === "user" ? "user" : "ai"}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  // Image (if any)
  if (imageUrl && role === "user") {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.className = "attached-image";
    img.alt = "Attached image";
    img.loading = "lazy";
    bubble.appendChild(img);
  }

  // Text content — parse simple markdown
  if (text) {
    const textDiv = document.createElement("div");
    textDiv.className = "msg-text";
    textDiv.innerHTML = parseMarkdown(text);
    bubble.appendChild(textDiv);
  }

  row.appendChild(bubble);

  // Timestamp + sender
  if (timestamp) {
    const meta = document.createElement("div");
    meta.style.display = "flex";
    meta.style.flexDirection = "column";
    meta.style.gap = "1px";

    const time = document.createElement("span");
    time.className = "msg-time";
    time.textContent = timestamp;
    meta.appendChild(time);

    const sender = document.createElement("span");
    sender.className = "msg-sender";
    sender.textContent = role === "user" ? "You" : "AI";
    meta.appendChild(sender);

    row.appendChild(meta);
  }

  messagesContainer.appendChild(row);
  scrollToBottom();
}


// ── Markdown Parser (lightweight) ─────────────────────────────────────────────
function parseMarkdown(text) {
  // Escape HTML
  let html = escapeHtml(text);

  // Code blocks (```)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold **text** or __text__
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");

  // Italic *text* or _text_
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^_]+)_/g, "<em>$1</em>");

  // Headings
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm,  "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm,   "<h1>$1</h1>");

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");

  // Horizontal rule
  html = html.replace(/^---$/gm, "<hr>");

  // Unordered lists
  html = html.replace(/^\* (.+)$/gm, "<li>$1</li>");
  html = html.replace(/^- (.+)$/gm,  "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Newlines → <br> (only outside block elements)
  html = html.replace(/\n/g, "<br>");

  return html;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


// ── Utility ───────────────────────────────────────────────────────────────────
function scrollToBottom() {
  requestAnimationFrame(() => {
    chatArea.scrollTop = chatArea.scrollHeight;
  });
}

function formatBytes(bytes) {
  if (bytes < 1024)         return bytes + " B";
  if (bytes < 1024 * 1024)  return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function fillInput(text) {
  messageInput.value = text;
  messageInput.dispatchEvent(new Event("input"));
  messageInput.focus();
}

// Simple toast notification
function showToast(msg) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  toast.style.cssText = `
    position:fixed;bottom:90px;left:50%;transform:translateX(-50%);
    background:#333;color:#fff;padding:10px 20px;border-radius:24px;
    font-size:13px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.25);
    animation:fadeSlideUp 0.3s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}


// ── Init ──────────────────────────────────────────────────────────────────────
updateSendBtn();
messageInput.focus();
