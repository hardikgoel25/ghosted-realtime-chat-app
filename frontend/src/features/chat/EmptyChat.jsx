import { motion, useReducedMotion } from "framer-motion";
import { Ghost, SquarePen } from "lucide-react";
import { useUIStore } from "../../stores/useUIStore";

export default function EmptyChat() {
  const setNewChatOpen = useUIStore((s) => s.setNewChatOpen);
  const reduce = useReducedMotion();
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-sm space-y-4">
        <motion.div
          animate={reduce ? undefined : { y: [0, -6, 0] }}
          transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
          className="mx-auto size-20 rounded-3xl bg-primary/10 flex items-center justify-center"
        >
          <Ghost className="size-10 text-primary" />
        </motion.div>
        <h2 className="text-2xl font-bold">Your messages</h2>
        <p className="text-base-content/60">
          Pick a conversation on the left, or start a new one. Everything here updates live.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setNewChatOpen(true)}>
          <SquarePen className="size-4" /> New chat
        </button>
      </div>
    </div>
  );
}
