import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Mic, X } from "lucide-react";
import { LIMITS } from "@ghosted/shared";
import { formatDuration } from "../../lib/utils";

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

/** Records from the microphone until Send or Cancel; calls onDone({ file, durationMs }). */
export default function VoiceRecorder({ onDone, onCancel }) {
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef(null);
  const chunks = useRef([]);
  const startedAt = useRef(0);
  const outcome = useRef(null); // "send" | "cancel"

  useEffect(() => {
    let stream;
    let timer;
    let cancelled = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        toast.error("Microphone access was denied");
        onCancel();
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const mimeType = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timer);
        if (outcome.current !== "send") return onCancel();
        const type = rec.mimeType || "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunks.current, { type });
        const file = new File([blob], `voice-note.${ext}`, { type });
        onDone({ file, durationMs: Date.now() - startedAt.current });
      };
      rec.start(250);
      startedAt.current = Date.now();
      timer = setInterval(() => {
        const ms = Date.now() - startedAt.current;
        setElapsed(ms);
        if (ms >= LIMITS.AUDIO_MAX_DURATION_MS) {
          outcome.current = "send";
          rec.stop();
        }
      }, 200);
    })();

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (recorder.current && recorder.current.state !== "inactive") {
        outcome.current ??= "cancel";
        recorder.current.stop();
      }
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = (result) => {
    outcome.current = result;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    else if (result === "cancel") onCancel();
  };

  return (
    <div className="flex items-center gap-3 px-2 py-1.5" role="status" aria-live="polite">
      <span className="relative flex size-3">
        <span className="absolute inline-flex h-full w-full rounded-full bg-error opacity-75 animate-ping" />
        <span className="relative inline-flex size-3 rounded-full bg-error" />
      </span>
      <Mic className="size-4 text-error" aria-hidden="true" />
      <span className="text-sm tabular-nums">Recording {formatDuration(elapsed)}</span>
      <span className="text-xs text-base-content/50 hidden sm:inline">
        up to {formatDuration(LIMITS.AUDIO_MAX_DURATION_MS)}
      </span>
      <span className="flex-1" />
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-circle"
        onClick={() => stop("cancel")}
        aria-label="Cancel recording"
      >
        <X className="size-4" />
      </button>
      <button
        type="button"
        className="btn btn-primary btn-sm btn-circle"
        onClick={() => stop("send")}
        aria-label="Send voice message"
      >
        <Check className="size-4" />
      </button>
    </div>
  );
}
