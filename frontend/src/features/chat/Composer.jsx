import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { ImagePlus, Send, X } from "lucide-react";
import { ALLOWED_IMAGE_MIME, LIMITS, SOCKET_EVENTS } from "@ghosted/shared";
import { emit } from "../../lib/socket";
import { prepareImage, validateImageFile } from "../../lib/images";
import { useAuthStore } from "../../stores/useAuthStore";
import { useConversationStore } from "../../stores/useConversationStore";
import { useMessageStore } from "../../stores/useMessageStore";
import { useUIStore } from "../../stores/useUIStore";
import { otherParticipant } from "../conversations/conversationHelpers";

const TYPING_STOP_MS = 3000;
const MAX_HEIGHT_PX = 160;

const Composer = forwardRef(function Composer({ conversation }, ref) {
  const id = conversation._id;
  const me = useAuthStore((s) => s.authUser);
  const setDraft = useConversationStore((s) => s.setDraft);
  const send = useMessageStore((s) => s.send);
  const online = useUIStore((s) => s.online);

  const [text, setText] = useState(() => useConversationStore.getState().drafts[id] ?? "");
  const [files, setFiles] = useState([]); // [{ file, url }]
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingRef = useRef({ active: false, timer: null });

  const other = otherParticipant(conversation, me._id)?.user;
  const unavailable = Boolean(other && other.status !== "active");

  // Switch conversation: restore its draft, drop any attachments
  useEffect(() => {
    setText(useConversationStore.getState().drafts[id] ?? "");
    setFiles((prev) => {
      for (const f of prev) URL.revokeObjectURL(f.url);
      return [];
    });
    const typing = typingRef.current;
    typing.active = false;
    clearTimeout(typing.timer);
    return () => clearTimeout(typing.timer);
  }, [id]);

  // Draft autosave
  useEffect(() => {
    const timer = setTimeout(() => setDraft(id, text), 400);
    return () => clearTimeout(timer);
  }, [text, id, setDraft]);

  // Auto-grow
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [text]);

  const emitTyping = (isTyping) =>
    emit(isTyping ? SOCKET_EVENTS.TYPING_START : SOCKET_EVENTS.TYPING_STOP, { conversationId: id });

  const stopTyping = () => {
    clearTimeout(typingRef.current.timer);
    if (typingRef.current.active) {
      typingRef.current.active = false;
      emitTyping(false);
    }
  };

  const onChange = (e) => {
    setText(e.target.value);
    if (!typingRef.current.active) {
      typingRef.current.active = true;
      emitTyping(true);
    }
    clearTimeout(typingRef.current.timer);
    typingRef.current.timer = setTimeout(stopTyping, TYPING_STOP_MS);
  };

  const addFiles = async (incoming) => {
    const accepted = [];
    for (const file of incoming) {
      const error = validateImageFile(file);
      if (error) toast.error(error);
      else accepted.push(file);
    }
    if (accepted.length === 0) return;
    const room = LIMITS.MESSAGE_IMAGES_MAX - files.length;
    if (accepted.length > room) {
      toast.error(`You can attach up to ${LIMITS.MESSAGE_IMAGES_MAX} images per message`);
    }
    const prepared = await Promise.all(
      accepted.slice(0, Math.max(0, room)).map((f) => prepareImage(f))
    );
    setFiles((prev) => [
      ...prev,
      ...prepared.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);
    textareaRef.current?.focus();
  };

  useImperativeHandle(ref, () => ({ addFiles, focus: () => textareaRef.current?.focus() }));

  const removeFile = (url) => {
    URL.revokeObjectURL(url);
    setFiles((prev) => prev.filter((f) => f.url !== url));
  };

  const canSend = (text.trim().length > 0 || files.length > 0) && !unavailable;

  const submit = async (e) => {
    e?.preventDefault();
    if (!canSend) return;
    const payload = { text: text.trim(), files: files.map((f) => f.file) };
    for (const f of files) URL.revokeObjectURL(f.url);
    setText("");
    setFiles([]);
    setDraft(id, "");
    stopTyping();
    textareaRef.current?.focus();
    await send(id, payload);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const onPaste = (e) => {
    const pasted = [...(e.clipboardData?.items ?? [])]
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (pasted.length) {
      e.preventDefault();
      addFiles(pasted);
    }
  };

  if (unavailable) {
    return (
      <div className="shrink-0 p-3 text-center text-sm text-base-content/60 border-t border-base-300 pb-safe">
        This person is no longer available, so you can&apos;t send them messages.
      </div>
    );
  }

  const remaining = LIMITS.MESSAGE_TEXT_MAX - text.length;

  return (
    <form
      onSubmit={submit}
      className="shrink-0 border-t border-base-300 bg-base-100 px-2 py-2 sm:px-3 pb-safe"
    >
      {files.length > 0 && (
        <div className="flex gap-2 mb-2 overflow-x-auto scrollbar-none px-1 pt-1">
          {files.map((f) => (
            <div key={f.url} className="relative shrink-0">
              <img
                src={f.url}
                alt=""
                className="size-16 rounded-lg object-cover border border-base-300"
              />
              <button
                type="button"
                className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-base-300 border border-base-100 flex items-center justify-center"
                onClick={() => removeFile(f.url)}
                aria-label="Remove image"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-1.5">
        <button
          type="button"
          className="btn btn-ghost btn-circle btn-sm shrink-0"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach images"
          title="Attach images"
          disabled={files.length >= LIMITS.MESSAGE_IMAGES_MAX}
        >
          <ImagePlus className="size-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_IMAGE_MIME.join(",")}
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles([...e.target.files]);
            e.target.value = "";
          }}
        />

        <div className="flex-1 min-w-0 relative">
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={stopTyping}
            maxLength={LIMITS.MESSAGE_TEXT_MAX}
            placeholder={
              online ? "Type a message" : "You're offline — messages send once you're back"
            }
            aria-label="Message"
            className="textarea w-full resize-none leading-snug min-h-10 max-h-40 py-2.5"
          />
          {remaining < 400 && (
            <span
              className={`absolute right-2 -top-4 text-[10px] ${remaining < 50 ? "text-error" : "text-base-content/50"}`}
            >
              {remaining}
            </span>
          )}
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-circle btn-sm shrink-0"
          disabled={!canSend}
          aria-label="Send message"
          title="Send (Enter)"
        >
          <Send className="size-4" />
        </button>
      </div>
    </form>
  );
});

export default Composer;
