import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AtSign, Camera, Loader2, Trash2, User } from "lucide-react";
import { ALLOWED_IMAGE_MIME, GENDERS, LIMITS, updateProfileSchema } from "@ghosted/shared";
import { useAuthStore } from "../../stores/useAuthStore";
import { prepareImage } from "../../lib/images";
import Avatar from "../../components/ui/Avatar";

const GENDER_LABELS = {
  male: "Male",
  female: "Female",
  other: "Other",
  "prefer not to say": "Prefer not to say",
};

export default function ProfileSection() {
  const authUser = useAuthStore((s) => s.authUser);
  const isUpdatingProfile = useAuthStore((s) => s.isUpdatingProfile);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const uploadAvatar = useAuthStore((s) => s.uploadAvatar);
  const removeAvatar = useAuthStore((s) => s.removeAvatar);
  const [form, setForm] = useState({ fullname: "", username: "", bio: "", gender: "" });
  const [errors, setErrors] = useState({});
  const [preview, setPreview] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!authUser) return;
    setForm({
      fullname: authUser.fullname ?? "",
      username: authUser.username ?? "",
      bio: authUser.bio ?? "",
      gender: authUser.gender ?? "prefer not to say",
    });
  }, [authUser]);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  if (!authUser) return null;

  const onPickImage = async (e) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    if (!ALLOWED_IMAGE_MIME.includes(file.type))
      return toast.error("Please choose a JPEG, PNG, WebP or GIF image");
    if (file.size > LIMITS.AVATAR_MAX_BYTES && file.type === "image/gif") {
      return toast.error(
        `GIF avatars must be under ${Math.round(LIMITS.AVATAR_MAX_BYTES / 1024 / 1024)} MB`
      );
    }
    const prepared = await prepareImage(file, { maxDimension: 1024 });
    if (prepared.size > LIMITS.AVATAR_MAX_BYTES) {
      return toast.error(
        `Image must be under ${Math.round(LIMITS.AVATAR_MAX_BYTES / 1024 / 1024)} MB`
      );
    }
    setPreview(URL.createObjectURL(prepared));
    const ok = await uploadAvatar(prepared);
    if (!ok) setPreview(null);
  };

  const dirty =
    form.fullname !== authUser.fullname ||
    form.username !== authUser.username ||
    form.bio !== (authUser.bio ?? "") ||
    form.gender !== authUser.gender;

  const save = async (e) => {
    e.preventDefault();
    const changes = {};
    if (form.fullname !== authUser.fullname) changes.fullname = form.fullname;
    if (form.username !== authUser.username) changes.username = form.username;
    if (form.bio !== (authUser.bio ?? "")) changes.bio = form.bio;
    if (form.gender !== authUser.gender) changes.gender = form.gender;
    const result = updateProfileSchema.safeParse(changes);
    if (!result.success) {
      const next = {};
      for (const issue of result.error.issues) next[issue.path[0] ?? "form"] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    await updateProfile(result.data);
  };

  const field = (name) => ({
    value: form[name],
    disabled: isUpdatingProfile,
    onChange: (e) => {
      setForm({ ...form, [name]: e.target.value });
      if (errors[name]) setErrors({ ...errors, [name]: undefined });
    },
  });

  const hasUploadedAvatar = Boolean(authUser.avatar?.publicId);
  const previewUser = preview ? { ...authUser, avatar: { url: preview } } : authUser;

  return (
    <div className="space-y-6">
      <div className="surface p-6 flex flex-col sm:flex-row items-center gap-5">
        <div className="relative">
          <Avatar user={previewUser} size="xl" />
          <button
            type="button"
            className={`btn btn-primary btn-sm btn-circle absolute -bottom-1 -right-1 ${isUpdatingProfile ? "btn-disabled" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload a new photo"
          >
            <Camera className="size-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={ALLOWED_IMAGE_MIME.join(",")}
            onChange={onPickImage}
            disabled={isUpdatingProfile}
          />
        </div>
        <div className="text-center sm:text-left">
          <div className="font-semibold text-lg">{authUser.fullname}</div>
          <div className="text-sm text-base-content/60">@{authUser.username}</div>
          <div className="mt-2 flex items-center justify-center sm:justify-start gap-2 text-sm text-base-content/60">
            {isUpdatingProfile ? "Saving…" : "JPEG, PNG, WebP or GIF up to 2 MB"}
            {hasUploadedAvatar && !isUpdatingProfile && (
              <button
                type="button"
                className="btn btn-ghost btn-xs gap-1"
                onClick={() => {
                  setPreview(null);
                  removeAvatar();
                }}
              >
                <Trash2 className="size-3" /> Remove photo
              </button>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={save} className="surface p-6 space-y-5" noValidate>
        <div>
          <label
            className="flex items-center gap-2 text-sm font-medium mb-1.5"
            htmlFor="profile-fullname"
          >
            <User className="size-4 opacity-60" /> Full name
          </label>
          <input
            id="profile-fullname"
            type="text"
            maxLength={LIMITS.FULLNAME_MAX}
            className={`input w-full ${errors.fullname ? "input-error" : ""}`}
            {...field("fullname")}
          />
          {errors.fullname && <p className="text-error text-xs mt-1">{errors.fullname}</p>}
        </div>

        <div>
          <label
            className="flex items-center gap-2 text-sm font-medium mb-1.5"
            htmlFor="profile-username"
          >
            <AtSign className="size-4 opacity-60" /> Username
          </label>
          <input
            id="profile-username"
            type="text"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={LIMITS.USERNAME_MAX}
            className={`input w-full ${errors.username ? "input-error" : ""}`}
            {...field("username")}
          />
          <p className={`text-xs mt-1 ${errors.username ? "text-error" : "text-base-content/50"}`}>
            {errors.username || "Lowercase letters, numbers, dots or underscores"}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" htmlFor="profile-bio">
            Bio
          </label>
          <textarea
            id="profile-bio"
            className={`textarea w-full resize-none ${errors.bio ? "textarea-error" : ""}`}
            maxLength={LIMITS.BIO_MAX}
            rows={3}
            placeholder="A line about you"
            {...field("bio")}
          />
          <p className="text-xs text-base-content/50 text-right">
            {form.bio.length}/{LIMITS.BIO_MAX}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" htmlFor="profile-gender">
            Gender
          </label>
          <select id="profile-gender" className="select w-full" {...field("gender")}>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {GENDER_LABELS[g]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-base-content/50">
            Member since{" "}
            {new Date(authUser.createdAt).toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </p>
          <button type="submit" className="btn btn-primary" disabled={isUpdatingProfile || !dirty}>
            {isUpdatingProfile ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Saving…
              </>
            ) : (
              "Save changes"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
