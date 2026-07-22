import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PaperPlaneTilt, Sparkle, Stethoscope } from "@phosphor-icons/react";
import { BACKEND_URL } from "@/lib/api";

/**
 * Streaming AI symptom assistant.
 * Uses fetch + SSE-style chunk reading from the backend.
 */
export default function AIChat({ open, onOpenChange }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hi, I'm MediLink AI. Tell me what symptoms you're experiencing and I'll help you understand if it's urgent. (This is not a diagnosis.)",
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    try {
      const token = localStorage.getItem("ml_token");
      const res = await fetch(`${BACKEND_URL}/api/ai/symptom-check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: text,
          history: messages
            .slice(1, 12)  // skip greeting, cap context
            .filter((m) => m.content)
            .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
        }),
      });

      if (!res.ok || !res.body) throw new Error("Failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).replace(/^ /, "");
          if (raw === "[DONE]") continue;
          let chunk = raw;
          if (raw.startsWith('"')) {
            try { chunk = JSON.parse(raw); } catch (_) { chunk = raw; }
          }
          if (chunk.startsWith("[ERROR]")) {
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = { role: "assistant", content: chunk };
              return copy;
            });
            continue;
          }
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = {
              role: "assistant",
              content: (copy[copy.length - 1].content || "") + chunk,
            };
            return copy;
          });
        }
      }
    } catch (e) {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = {
          role: "assistant",
          content: "Sorry, I couldn't reach the AI service. Please try again.",
        };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        data-testid="ai-chat-panel"
        side="right"
        className="glass !w-full sm:!max-w-[460px] p-0 flex flex-col border-l border-white/40"
      >
        <SheetHeader className="px-6 pt-6 pb-3 border-b border-[#DCE8E9]/60">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-[#0B7C8C] flex items-center justify-center">
              <Stethoscope size={18} color="#F4F9F9" weight="duotone" />
            </div>
            <div>
              <SheetTitle className="font-display text-lg leading-tight">
                MediLink AI
              </SheetTitle>
              <SheetDescription className="text-xs">
                Symptom triage assistant
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  data-testid={`chat-msg-${m.role}`}
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-[#0B7C8C] text-[#F4F9F9] rounded-br-md"
                      : "bg-white border border-[#DCE8E9] text-[#12262B] rounded-bl-md"
                  }`}
                >
                  {m.content || (
                    <span className="inline-flex items-center gap-1 text-[#5A6B70]">
                      <Sparkle size={12} weight="fill" className="animate-pulse" />
                      thinking…
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="border-t border-[#DCE8E9]/60 p-4 bg-white/40 backdrop-blur-md">
          <div className="flex gap-2 items-end">
            <Textarea
              data-testid="ai-chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Describe your symptoms…"
              className="resize-none min-h-[52px] max-h-32 bg-white border-[#DCE8E9] focus-visible:ring-[#0B7C8C]"
            />
            <Button
              data-testid="ai-chat-send"
              onClick={send}
              disabled={streaming || !input.trim()}
              className="h-[52px] bg-[#0A3D62] hover:bg-[#083150] text-[#F4F9F9]"
            >
              <PaperPlaneTilt size={18} weight="fill" />
            </Button>
          </div>
          <div className="text-[10px] text-[#5A6B70] mt-2 font-mono text-center">
            Not a substitute for professional medical advice.
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
