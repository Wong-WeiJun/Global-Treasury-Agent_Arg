import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChatService } from "../../client";

export const Route = createFileRoute("/_layout/chat")({
  component: ChatPage,
});

interface Message {
  role: "user" | "assistant";
  content: string;
}

function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: "user", content: input };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    setLoading(true);
    try {
      const res = await ChatService.chat({
        requestBody: {
          message: input,
          history: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        },
      });
      setMessages([...newHistory, { role: "assistant", content: res.reply }]);
    } catch {
      setMessages([
        ...newHistory,
        { role: "assistant", content: "Error reaching AI." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[80vh] max-w-2xl mx-auto p-4 gap-4">
      <h1 className="text-2xl font-bold">AI Chat</h1>
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 border rounded-lg p-4">
        {messages.length === 0 && (
          <p className="text-gray-400 text-center mt-8">
            Start a conversation...
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
              msg.role === "user"
                ? "self-end bg-blue-600 text-white"
                : "self-start bg-gray-100 text-gray-800"
            }`}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div className="self-start bg-gray-100 text-gray-500 rounded-lg px-4 py-2 text-sm animate-pulse">
            Thinking...
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Type a message..."
          disabled={loading}
        />
        <button
          type="button"
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
