import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Image, Loader2, Send, X } from "lucide-react";
import { ALLOWED_IMAGE_MIME, LIMITS } from "@ghosted/shared";
import { useChatStore } from "../store/useChatStore";

const TYPING_STOP_MS = 3000;

const MessageInput = () => {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);
  const typingRef = useRef({ active: false, timer: null });
  const { sendMessage, isSending, emitTyping, selectedUser } = useChatStore();

  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  // Reset the draft and typing state when switching conversations
  useEffect(() => {
    setText("");
    setFile(null);
    setPreviewUrl(null);
    const ref = typingRef.current;
    return () => {
      clearTimeout(ref.timer);
      ref.active = false;
    };
  }, [selectedUser?._id]);

  const stopTyping = () => {
    clearTimeout(typingRef.current.timer);
    if (typingRef.current.active) {
      typingRef.current.active = false;
      emitTyping(false);
    }
  };

  const handleTextChange = (e) => {
    setText(e.target.value);
    if (!typingRef.current.active) {
      typingRef.current.active = true;
      emitTyping(true);
    }
    clearTimeout(typingRef.current.timer);
    typingRef.current.timer = setTimeout(stopTyping, TYPING_STOP_MS);
  };

  const pickFile = (candidate) => {
    if (!candidate) return;
    if (!ALLOWED_IMAGE_MIME.includes(candidate.type)) {
      toast.error("Please select a JPEG, PNG, WebP or GIF image");
      return;
    }
    if (candidate.size > LIMITS.IMAGE_MAX_BYTES) {
      toast.error(`Image must be under ${Math.round(LIMITS.IMAGE_MAX_BYTES / 1024 / 1024)} MB`);
      return;
    }
    setFile(candidate);
    setPreviewUrl(URL.createObjectURL(candidate));
  };

  const handleImageChange = (e) => {
    pickFile(e.target.files?.[0]);
  };

  const handlePaste = (e) => {
    const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
    if (item) {
      e.preventDefault();
      pickFile(item.getAsFile());
    }
  };

  const removeImage = () => {
    setFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if ((!trimmed && !file) || isSending) return;
    stopTyping();
    const ok = await sendMessage({ text: trimmed, file });
    if (ok) {
      setText("");
      removeImage();
    }
  };

  const canSend = (text.trim().length > 0 || Boolean(file)) && !isSending;

  return (
    <div className="p-4 w-full">
      {previewUrl && (
        <div className="mb-3 flex items-center gap-2">
          <div className="relative">
            <img
              src={previewUrl}
              alt="Selected attachment"
              className="w-20 h-20 object-cover rounded-lg border border-base-300"
            />
            <button
              onClick={removeImage}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-base-300 flex items-center justify-center"
              type="button"
              aria-label="Remove image"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSendMessage} className="flex items-center gap-2">
        <div className="flex-1 flex gap-2">
          <input
            type="text"
            className="w-full input input-bordered rounded-lg input-sm sm:input-md"
            placeholder="Type a message..."
            value={text}
            maxLength={LIMITS.MESSAGE_TEXT_MAX}
            onChange={handleTextChange}
            onPaste={handlePaste}
            onBlur={stopTyping}
            aria-label="Message"
          />
          <input
            type="file"
            accept={ALLOWED_IMAGE_MIME.join(",")}
            className="hidden"
            ref={fileInputRef}
            onChange={handleImageChange}
          />
          <button
            type="button"
            className={`hidden sm:flex btn btn-circle ${file ? "text-success" : "text-base-content/50"}`}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach an image"
          >
            <Image size={20} />
          </button>
        </div>
        <button
          type="submit"
          className="btn btn-circle btn-primary"
          disabled={!canSend}
          aria-label="Send"
        >
          {isSending ? <Loader2 size={20} className="animate-spin" /> : <Send size={22} />}
        </button>
      </form>
    </div>
  );
};

export default MessageInput;
