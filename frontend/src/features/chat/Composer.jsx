import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Ban, ImagePlus, Mic, Paperclip, Pencil, Reply, Send, SmilePlus, X } from "lucide-react";
import { ALLOWED_FILE_MIME, ALLOWED_IMAGE_MIME, LIMITS, SOCKET_EVENTS } from "@ghosted/shared";
import { emit } from "../../lib/socket";
import { prepareImage, validateImageFile } from "../../lib/images";
import { formatBytes } from "../../lib/format";
import { messagePreview } from "../../lib/utils";
import { useAuthStore } from "../../stores/useAuthStore";
import { useConversationStore } from "../../stores/useConversationStore";
import { useMessageStore } from "../../stores/useMessageStore";
import { useUIStore } from "../../stores/useUIStore";
import EmojiPicker from "../../components/ui/EmojiPicker";
import FileChip from "./FileChip";
import VoiceRecorder from "./VoiceRecorder";
import { memberName, otherParticipant } from "../conversations/conversationHelpers";

const TYPING_STOP_MS = 3000;
const MAX_HEIGHT_PX = 160;
const FILE_EXT = ["pdf", "zip", "docx", "xlsx", "pptx", "txt", "csv", "md", "json"];

let attachmentSeq = 0;

function validateDocument(file) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_FILE_MIME.includes(file.type) && !FILE_EXT.includes(ext)) {
    return `"${file.name}" is not a supported file type (PDF, Office, ZIP, text)`;
  }
  if (file.size > LIMITS.FILE_MAX_BYTES) {
    return `"${file.name}" is over ${formatBytes(LIMITS.FILE_MAX_BYTES)}`;
  }
  return null;
}

const Composer = forwardRef(function Composer({ conversation }, ref) {
  const id = conversation._id;
  const me = useAuthStore((s) => s.authUser);
  const mediaEnabled = useAuthStore((s) => s.config?.mediaEnabled !== false);
  const unblock = useAuthStore((s) => s.unblock);
  const setDraft = useConversationStore((s) => s.setDraft);
  const send = useMessageStore((s) => s.send);
  const edit = useMessageStore((s) => s.edit);
  const online = useUIStore((s) => s.online);
  const replyTo = useUIStore((s) => s.replyTo);
  const editing = useUIStore((s) => s.editing);
  const clearContext = useUIStore((s) => s.clearComposerContext);

  const [text, setText] = useState(() => useConversationStore.getState().drafts[id] ?? "");
  const [attachments, setAttachments] = useState([]); // [{ id, kind, file, url, name, size }]
  const [recording, setRecording] = useState(false);
  const [emojiAnchor, setEmojiAnchor] = useState(null);
  const textareaRef = useRef(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingRef = useRef({ active: false, timer: null });

  const other = otherParticipant(conversation, me._id)?.user;
  const unavailable = Boolean(other && other.status !== "active");
  const blockedByMe = Boolean(conversation.blocked?.byMe);
  const blockedByThem = Boolean(conversation.blocked?.byThem);

  // Switch conversation: restore its draft, drop attachments and context
  useEffect(() => {
    setText(useConversationStore.getState().drafts[id] ?? "");
    setAttachments((prev) => {
      for (const a of prev) if (a.url) URL.revokeObjectURL(a.url);
      return [];
    });
    setRecording(false);
    const typing = typingRef.current;
    typing.active = false;
    clearTimeout(typing.timer);
    return () => clearTimeout(typing.timer);
  }, [id]);

  // Entering edit mode loads the message text; leaving it restores the draft
  const draftBeforeEdit = useRef(null);
  useEffect(() => {
    if (editing) {
      draftBeforeEdit.current = text;
      setText(editing.text);
      textareaRef.current?.focus();
    } else if (draftBeforeEdit.current !== null) {
      setText(draftBeforeEdit.current);
      draftBeforeEdit.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  // Draft autosave (not while editing)
  useEffect(() => {
    if (editing) return;
    const timer = setTimeout(() => setDraft(id, text), 400);
    return () => clearTimeout(timer);
  }, [text, id, setDraft, editing]);

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

  const addFiles = async (incoming, kindHint) => {
    const list = [...incoming];
    const images = [];
    const docs = [];
    for (const file of list) {
      const kind = kindHint ?? (file.type.startsWith("image/") ? "image" : "file");
      if (kind === "image") {
        const error = validateImageFile(file);
        if (error) toast.error(error);
        else images.push(file);
      } else {
        const error = validateDocument(file);
        if (error) toast.error(error);
        else docs.push(file);
      }
    }
    const current = attachments;
    const imageRoom = LIMITS.MESSAGE_IMAGES_MAX - current.filter((a) => a.kind === "image").length;
    const fileRoom = LIMITS.MESSAGE_FILES_MAX - current.filter((a) => a.kind === "file").length;
    if (images.length > imageRoom)
      toast.error(`Up to ${LIMITS.MESSAGE_IMAGES_MAX} images per message`);
    if (docs.length > fileRoom) toast.error(`Up to ${LIMITS.MESSAGE_FILES_MAX} files per message`);
    const prepared = await Promise.all(
      images.slice(0, Math.max(0, imageRoom)).map((f) => prepareImage(f))
    );
    const next = [
      ...prepared.map((file) => ({
        id: ++attachmentSeq,
        kind: "image",
        file,
        url: URL.createObjectURL(file),
        name: file.name,
        size: file.size,
      })),
      ...docs.slice(0, Math.max(0, fileRoom)).map((file) => ({
        id: ++attachmentSeq,
        kind: "file",
        file,
        url: null,
        name: file.name,
        size: file.size,
      })),
    ];
    if (next.length) setAttachments((prev) => [...prev, ...next]);
    textareaRef.current?.focus();
  };

  useImperativeHandle(ref, () => ({ addFiles, focus: () => textareaRef.current?.focus() }));

  const removeAttachment = (att) => {
    if (att.url) URL.revokeObjectURL(att.url);
    setAttachments((prev) => prev.filter((a) => a.id !== att.id));
  };

  const insertEmoji = (emoji) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = start + emoji.length;
    });
  };

  const canInteract = !unavailable && !blockedByMe && !blockedByThem;
  const canSend = canInteract && (text.trim().length > 0 || attachments.length > 0);

  const submit = async (e) => {
    e?.preventDefault();
    if (editing) {
      const value = text.trim();
      if (!value || value === editing.text) return clearContext();
      const ok = await edit(id, editing._id, value);
      if (ok) clearContext();
      return;
    }
    if (!canSend) return;
    const payload = { text: text.trim(), attachments, replyTo };
    setText("");
    setAttachments([]);
    setDraft(id, "");
    clearContext();
    stopTyping();
    textareaRef.current?.focus();
    await send(id, payload);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape" && (editing || replyTo)) {
      e.preventDefault();
      clearContext();
    } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const onPaste = (e) => {
    const pasted = [...(e.clipboardData?.items ?? [])]
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (pasted.length) {
      e.preventDefault();
      addFiles(pasted);
    }
  };

  const onVoiceDone = async ({ file, durationMs }) => {
    setRecording(false);
    if (durationMs < 500) return toast.error("That recording was too short");
    await send(id, {
      text: "",
      attachments: [
        {
          id: ++attachmentSeq,
          kind: "audio",
          file,
          url: URL.createObjectURL(file),
          name: file.name,
          size: file.size,
          durationMs,
        },
      ],
      replyTo,
    });
    clearContext();
  };

  if (unavailable || blockedByThem) {
    return (
      <div className="shrink-0 p-3 text-center text-sm text-base-content/60 border-t border-base-300 pb-safe flex items-center justify-center gap-2">
        <Ban className="size-4" />
        {unavailable
          ? "This person is no longer available, so you can't send them messages."
          : "You can't message this person."}
      </div>
    );
  }

  if (blockedByMe) {
    return (
      <div className="shrink-0 p-3 border-t border-base-300 pb-safe flex flex-wrap items-center justify-center gap-3 text-sm">
        <span className="text-base-content/70 flex items-center gap-2">
          <Ban className="size-4" /> You blocked {other?.fullname?.split(" ")[0] ?? "this person"}.
        </span>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={() => other && unblock(other._id)}
        >
          Unblock
        </button>
      </div>
    );
  }

  const remaining = LIMITS.MESSAGE_TEXT_MAX - text.length;
  const context = editing
    ? { icon: Pencil, label: "Editing message", preview: editing.text }
    : replyTo
      ? {
          icon: Reply,
          label: `Replying to ${replyTo.senderId === me._id ? "yourself" : memberName(conversation, replyTo.senderId, me._id)}`,
          preview: messagePreview(replyTo),
        }
      : null;

  return (
    <form
      onSubmit={submit}
      className="shrink-0 border-t border-base-300 bg-base-100 px-2 py-2 sm:px-3 pb-safe"
    >
      {context && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg bg-base-200 border-l-2 border-primary text-sm">
          <context.icon className="size-4 text-primary shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-primary">{context.label}</span>
            <span className="block truncate text-base-content/70">{context.preview}</span>
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-circle"
            onClick={clearContext}
            aria-label="Cancel"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {attachments.length > 0 && !editing && (
        <div className="flex gap-2 mb-2 overflow-x-auto scrollbar-none px-1 pt-1">
          {attachments.map((a) =>
            a.kind === "image" ? (
              <div key={a.id} className="relative shrink-0">
                <img
                  src={a.url}
                  alt=""
                  className="size-16 rounded-lg object-cover border border-base-300"
                />
                <button
                  type="button"
                  className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-base-300 border border-base-100 flex items-center justify-center"
                  onClick={() => removeAttachment(a)}
                  aria-label="Remove image"
                >
                  <X className="size-3" />
                </button>
              </div>
            ) : (
              <div key={a.id} className="shrink-0">
                <FileChip attachment={a} onRemove={() => removeAttachment(a)} />
              </div>
            )
          )}
        </div>
      )}

      {recording ? (
        <VoiceRecorder onDone={onVoiceDone} onCancel={() => setRecording(false)} />
      ) : (
        <div className="flex items-end gap-1">
          {mediaEnabled && !editing && (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-circle btn-sm shrink-0"
                onClick={() => imageInputRef.current?.click()}
                aria-label="Attach images"
                title="Images"
              >
                <ImagePlus className="size-5" />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-circle btn-sm shrink-0 hidden sm:inline-flex"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach files"
                title="Files"
              >
                <Paperclip className="size-5" />
              </button>
              <input
                ref={imageInputRef}
                type="file"
                accept={ALLOWED_IMAGE_MIME.join(",")}
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles([...e.target.files], "image");
                  e.target.value = "";
                }}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept={[...ALLOWED_FILE_MIME, ...FILE_EXT.map((x) => `.${x}`)].join(",")}
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles([...e.target.files], "file");
                  e.target.value = "";
                }}
              />
            </>
          )}

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
                editing
                  ? "Edit your message"
                  : online
                    ? "Type a message"
                    : "You're offline — messages send once you're back"
              }
              aria-label="Message"
              className="textarea w-full resize-none leading-snug min-h-10 max-h-40 py-2.5 pr-9"
            />
            <button
              type="button"
              className="btn btn-ghost btn-xs btn-circle absolute right-1.5 bottom-2"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setEmojiAnchor({ clientX: r.right - 288, clientY: r.top - 300 });
              }}
              aria-label="Insert emoji"
            >
              <SmilePlus className="size-4 opacity-60" />
            </button>
            {remaining < 400 && (
              <span
                className={`absolute right-2 -top-4 text-[10px] ${remaining < 50 ? "text-error" : "text-base-content/50"}`}
              >
                {remaining}
              </span>
            )}
          </div>

          {mediaEnabled &&
          !editing &&
          !text.trim() &&
          attachments.length === 0 &&
          typeof MediaRecorder !== "undefined" ? (
            <button
              type="button"
              className="btn btn-primary btn-circle btn-sm shrink-0"
              onClick={() => setRecording(true)}
              aria-label="Record a voice message"
              title="Voice message"
            >
              <Mic className="size-4" />
            </button>
          ) : (
            <button
              type="submit"
              className="btn btn-primary btn-circle btn-sm shrink-0"
              disabled={editing ? !text.trim() : !canSend}
              aria-label={editing ? "Save changes" : "Send message"}
              title={editing ? "Save (Enter)" : "Send (Enter)"}
            >
              {editing ? <Pencil className="size-4" /> : <Send className="size-4" />}
            </button>
          )}
        </div>
      )}

      <EmojiPicker
        anchor={emojiAnchor}
        onPick={insertEmoji}
        onClose={() => setEmojiAnchor(null)}
        quick={[]}
      />
    </form>
  );
});

export default Composer;
