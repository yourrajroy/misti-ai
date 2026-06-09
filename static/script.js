/* ==========================================
   MISTI AI CHATBOT — script.js v3
   ========================================== */
"use strict";

// ── State ─────────────────────────────────────────────────────────────────────
let currentChatId = null;
let isLoading     = false;

// ── DOM Refs ──────────────────────────────────────────────────────────────────
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
const scrollBottomBtn   = document.getElementById("scrollBottomBtn");

const messageInput      = document.getElementById("messageInput");
const sendBtn           = document.getElementById("sendBtn");
const copyToast         = document.getElementById("copyToast");


// ── Sidebar ───────────────────────────────────────────────────────────────────
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


// ── Chat History ──────────────────────────────────────────────────────────────
async function loadChatHistory() {
  try {
    const res  = await fetch("/api/chats");
    const data = await res.json();
    renderChatHistory(data.chats || []);
  } catch (e) {
    console.error("Failed to load history", e);
  }
}

function renderChatHistory(chats) {
  Array.from(chatHistory.querySelectorAll(".chat-history-item")).forEach(el => el.remove());

  if (chats.length === 0) {
    historyEmpty.style.display = "flex";
    return;
  }
  historyEmpty.style.display = "none";

  chats.forEach(chat => {
    const item = document.createElement("div");
    item.className = "chat-history-item" + (chat.id === currentChatId ? " active" : "");
    item.dataset.chatId = chat.id;

    const info = document.createElement("div");
    info.className = "chat-item-info";

    const title = document.createElement("span");
    title.className = "chat-item-title";
    title.textContent = chat.title || "New Chat";

    const meta = document.createElement("div");
    meta.className = "chat-item-meta";

    const count = document.createElement("span");
    count.className = "chat-item-count";
    const msgCount = chat.message_count || 0;
    count.textContent = msgCount === 0 ? "Empty" : `${msgCount} message${msgCount !== 1 ? "s" : ""}`;

    meta.appendChild(count);
    info.appendChild(title);
    info.appendChild(meta);

    const del = document.createElement("button");
    del.className = "chat-item-delete";
    del.title = "Delete chat";
    del.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>`;
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      await deleteChat(chat.id);
    });

    item.appendChild(info);
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
    messages.forEach(msg => renderMessage(msg.role, msg.content, msg.timestamp));

    closeSidebar();
    scrollToBottom(true);
  } catch (e) {
    console.error("Failed to load chat", e);
  }
}

async function deleteChat(chatId) {
  try {
    await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
    if (chatId === currentChatId) startNewChat();
    loadChatHistory();
  } catch (e) {
    console.error("Failed to delete", e);
  }
}


// ── New Chat ──────────────────────────────────────────────────────────────────
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
}


// ── Scroll to Bottom ──────────────────────────────────────────────────────────
chatArea.addEventListener("scroll", () => {
  const distFromBottom = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight;
  scrollBottomBtn.style.display = distFromBottom > 120 ? "flex" : "none";
});

scrollBottomBtn.addEventListener("click", () => scrollToBottom(true));

function scrollToBottom(force = false) {
  requestAnimationFrame(() => {
    const distFromBottom = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight;
    if (force || distFromBottom < 300) {
      chatArea.scrollTop = chatArea.scrollHeight;
    }
  });
}


// ── Message Input ─────────────────────────────────────────────────────────────
messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + "px";
  updateSendBtn();
});

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) sendMessage();
  }
});

function updateSendBtn() {
  sendBtn.disabled = isLoading || messageInput.value.trim().length === 0;
}
sendBtn.addEventListener("click", sendMessage);


// ── Send Message ──────────────────────────────────────────────────────────────
async function sendMessage() {
  const text = messageInput.value.trim();
  if (isLoading || !text) return;

  isLoading = true;
  updateSendBtn();
  welcomeScreen.style.display = "none";

  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  renderMessage("user", text, now);

  messageInput.value = "";
  messageInput.style.height = "auto";

  typingIndicator.style.display = "flex";
  scrollToBottom(true);

  try {
    const res  = await fetch("/api/send", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ chat_id: currentChatId, message: text })
    });

    const data = await res.json();
    typingIndicator.style.display = "none";

    if (res.status === 429) {
      // Rate limit hit — show clear feedback
      showToast(data.error || "Too many messages. Please wait a moment.");
      renderMessage("ai", `⚠️ ${data.error || "Rate limit reached. Please slow down."}`, now);
    } else if (data.error) {
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
  scrollToBottom(true);
}


// ── Render Message ────────────────────────────────────────────────────────────
function renderMessage(role, text, timestamp) {
  const row = document.createElement("div");
  row.className = `message-row ${role === "user" ? "user" : "ai"}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (text) {
    const textDiv = document.createElement("div");
    textDiv.className = "msg-text";
    textDiv.innerHTML = parseMarkdown(text);
    bubble.appendChild(textDiv);
  }

  row.appendChild(bubble);

  // Copy button for AI messages
  if (role === "ai" && text) {
    const actions = document.createElement("div");
    actions.className = "bubble-actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`;
    copyBtn.addEventListener("click", () => copyText(text, copyBtn));
    actions.appendChild(copyBtn);
    row.appendChild(actions);
  }

  // Timestamp
  if (timestamp) {
    const meta = document.createElement("div");
    meta.className = "msg-meta";

    const time = document.createElement("span");
    time.className = "msg-time";
    time.textContent = timestamp;

    const sender = document.createElement("span");
    sender.className = "msg-sender";
    sender.textContent = role === "user" ? "You" : "Misti AI";

    meta.appendChild(time);
    meta.appendChild(sender);
    row.appendChild(meta);
  }

  messagesContainer.appendChild(row);
  scrollToBottom();
}


// ── Copy Text ─────────────────────────────────────────────────────────────────
async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
    copyToast.classList.add("show");
    setTimeout(() => {
      copyToast.classList.remove("show");
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`;
    }, 2000);
  } catch (e) {
    showToast("Copy failed — try long-pressing the text");
  }
}


// ── Markdown Parser ───────────────────────────────────────────────────────────
function parseMarkdown(text) {
  let html = escapeHtml(text);

  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`;
  });
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__(.+?)__/g,      "<strong>$1</strong>");
  html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^_\n]+)_/g,   "<em>$1</em>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm,  "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm,   "<h1>$1</h1>");
  html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
  html = html.replace(/^---$/gm, "<hr>");
  html = html.replace(/^[\*\-] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>[\s\S]*?<\/li>)(\n<li>|$)/g, "$1$2");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
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


// ── Utilities ─────────────────────────────────────────────────────────────────
function fillInput(text) {
  messageInput.value = text;
  messageInput.dispatchEvent(new Event("input"));
  messageInput.focus();
}

function showToast(msg) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  toast.style.cssText = `
    position:fixed;bottom:90px;left:50%;transform:translateX(-50%);
    background:#1e0a3c;color:#fff;padding:10px 20px;border-radius:24px;
    font-size:13px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.3);
    animation:fadeSlideUp 0.3s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}


// ── Init ──────────────────────────────────────────────────────────────────────
updateSendBtn();
messageInput.focus();
