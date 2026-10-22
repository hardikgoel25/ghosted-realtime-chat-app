import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MessageSquare, Settings, UserX } from "lucide-react";
import { api } from "../../lib/api";
import { lastSeenLabel } from "../../lib/format";
import { useAuthStore } from "../../stores/useAuthStore";
import { useConversationStore } from "../../stores/useConversationStore";
import Avatar from "../../components/ui/Avatar";
import EmptyState from "../../components/ui/EmptyState";
import Spinner from "../../components/ui/Spinner";

export default function UserProfilePage() {
  const { username } = useParams();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.authUser);
  const onlineUsers = useAuthStore((s) => s.onlineUsers);
  const presenceLastSeen = useAuthStore((s) => s.lastSeen);
  const openDirect = useConversationStore((s) => s.openDirect);
  const [user, setUser] = useState(null);
  const [state, setState] = useState("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    api
      .get(`/users/${username}`, { silent: true })
      .then(({ user: u }) => {
        if (cancelled) return;
        setUser(u);
        setState("ready");
      })
      .catch(() => !cancelled && setState("missing"));
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (state === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }
  if (state === "missing" || !user) {
    return (
      <EmptyState
        icon={UserX}
        title="User not found"
        description="This account may have been deleted or disabled."
        action={
          <Link to="/" className="btn btn-primary btn-sm">
            Back to chats
          </Link>
        }
        className="flex-1"
      />
    );
  }

  const isMe = user._id === me._id;
  const online = onlineUsers.includes(user._id);
  const lastSeen =
    presenceLastSeen[user._id] !== undefined ? presenceLastSeen[user._id] : user.lastSeenAt;

  const message = async () => {
    setBusy(true);
    try {
      const conversation = await openDirect(user._id);
      navigate(`/c/${conversation._id}`);
    } catch {
      // handled by the API client
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="h-14 flex items-center gap-2 px-2 sm:px-3 border-b border-base-300">
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-circle"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="font-semibold">Profile</h1>
      </header>

      <div className="max-w-lg mx-auto p-6">
        <div className="surface p-8 flex flex-col items-center text-center gap-4">
          <Avatar user={user} size="xl" online={isMe ? undefined : online} />
          <div>
            <h2 className="text-2xl font-bold">{user.fullname}</h2>
            <p className="text-base-content/60">@{user.username}</p>
            {!isMe && (
              <p className="text-xs text-base-content/60 mt-1">
                {online ? "Online" : lastSeenLabel(lastSeen)}
              </p>
            )}
          </div>
          {user.bio && <p className="text-base-content/80 max-w-sm">{user.bio}</p>}
          <p className="text-xs text-base-content/50">
            Member since{" "}
            {new Date(user.createdAt).toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </p>
          {isMe ? (
            <Link to="/settings/profile" className="btn btn-outline btn-sm">
              <Settings className="size-4" /> Edit profile
            </Link>
          ) : (
            <button type="button" className="btn btn-primary" onClick={message} disabled={busy}>
              {busy ? <Spinner size="sm" /> : <MessageSquare className="size-4" />} Message
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
