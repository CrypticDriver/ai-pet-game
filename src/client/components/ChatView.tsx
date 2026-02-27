import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "../../shared/types.js";

interface Props {
  messages: ChatMessage[];
  onSend: (message: string) => Promise<void>;
  petName: string;
}

export function ChatView({ messages, onSend, petName }: Props) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    try {
      await onSend(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chat-view">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div style={{
            textAlign: "center",
            color: "var(--text-dim)",
            fontSize: "10px",
            padding: "40px 20px",
            lineHeight: "2",
          }}>
            💬 和 {petName} 聊聊天吧！
            <br />
            它会记住你们的对话哦
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-bubble ${msg.role}`}>
            {msg.content}
          </div>
        ))}

        {sending && (
          <div className="chat-bubble typing">
            {petName} 正在思考<span className="dots"></span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        <input
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`对 ${petName} 说点什么...`}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={sending}
        />
        <button
          className="chat-send"
          onClick={handleSend}
          disabled={!input.trim() || sending}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
