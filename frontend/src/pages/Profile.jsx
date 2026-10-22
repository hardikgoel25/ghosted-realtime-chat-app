import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, Camera, Loader2, Trash2, User, AtSign } from "lucide-react";
import { ALLOWED_IMAGE_MIME, GENDERS, LIMITS, updateProfileSchema } from "@ghosted/shared";
import { useAuthStore } from "../store/useAuthStore";

const GENDER_LABELS = {
  male: "Male",
  female: "Female",
  other: "Other",
  "prefer not to say": "Prefer not to say",
};

const ProfilePage = () => {
  const navigate = useNavigate();
  const { authUser, isUpdatingProfile, updateProfile, uploadAvatar, removeAvatar } = useAuthStore();
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

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_MIME.includes(file.type)) {
      toast.error("Please choose a JPEG, PNG, WebP or GIF image");
      return;
    }
    if (file.size > LIMITS.AVATAR_MAX_BYTES) {
      toast.error(`Image must be under ${Math.round(LIMITS.AVATAR_MAX_BYTES / 1024 / 1024)} MB`);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    const ok = await uploadAvatar(file);
    if (!ok) setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const dirty =
    form.fullname !== authUser.fullname ||
    form.username !== authUser.username ||
    form.bio !== (authUser.bio ?? "") ||
    form.gender !== authUser.gender;

  const handleSave = async (e) => {
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

  return (
    <div className="min-h-screen pt-20">
      <div className="max-w-2xl mx-auto p-4 pb-8 pt-2">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-sm hover:underline mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </button>

        <div className="bg-base-300 rounded-xl p-6 space-y-8">
          <div className="text-center">
            <h1 className="text-2xl font-semibold">Profile</h1>
            <p className="mt-2 text-base-content/70">Your profile information</p>
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <img
                src={preview || authUser.avatar?.url || "/avatar.png"}
                alt="Your profile"
                className="size-32 rounded-full object-cover border-4 border-base-100"
              />
              <label
                htmlFor="avatar-upload"
                className={`absolute bottom-0 right-0 bg-base-content hover:scale-105 p-2 rounded-full cursor-pointer transition-all duration-200 ${
                  isUpdatingProfile ? "animate-pulse pointer-events-none" : ""
                }`}
                aria-label="Upload a new photo"
              >
                <Camera className="w-5 h-5 text-base-200" />
                <input
                  type="file"
                  id="avatar-upload"
                  className="hidden"
                  accept={ALLOWED_IMAGE_MIME.join(",")}
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  disabled={isUpdatingProfile}
                />
              </label>
            </div>
            <div className="flex items-center gap-3 text-sm text-base-content/60">
              <span>
                {isUpdatingProfile ? "Saving..." : "Click the camera icon to update your photo"}
              </span>
              {hasUploadedAvatar && !isUpdatingProfile && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs gap-1"
                  onClick={() => {
                    setPreview(null);
                    removeAvatar();
                  }}
                >
                  <Trash2 className="size-3" /> Remove
                </button>
              )}
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-5" noValidate>
            <div>
              <label
                className="text-sm text-base-content/60 flex items-center gap-2 mb-1"
                htmlFor="profile-fullname"
              >
                <User className="w-4 h-4" /> Full name
              </label>
              <input
                id="profile-fullname"
                type="text"
                maxLength={LIMITS.FULLNAME_MAX}
                className={`input input-bordered w-full bg-base-200 ${errors.fullname ? "input-error" : ""}`}
                {...field("fullname")}
              />
              {errors.fullname && <p className="text-error text-xs mt-1">{errors.fullname}</p>}
            </div>

            <div>
              <label
                className="text-sm text-base-content/60 flex items-center gap-2 mb-1"
                htmlFor="profile-username"
              >
                <AtSign className="w-4 h-4" /> Username
              </label>
              <input
                id="profile-username"
                type="text"
                autoCapitalize="none"
                maxLength={LIMITS.USERNAME_MAX}
                className={`input input-bordered w-full bg-base-200 ${errors.username ? "input-error" : ""}`}
                {...field("username")}
              />
              <p
                className={`text-xs mt-1 ${errors.username ? "text-error" : "text-base-content/50"}`}
              >
                {errors.username || "Lowercase letters, numbers, dots or underscores"}
              </p>
            </div>

            <div>
              <label className="text-sm text-base-content/60 block mb-1" htmlFor="profile-bio">
                Bio
              </label>
              <textarea
                id="profile-bio"
                className={`textarea textarea-bordered w-full bg-base-200 resize-none ${errors.bio ? "textarea-error" : ""}`}
                maxLength={LIMITS.BIO_MAX}
                rows={3}
                {...field("bio")}
              />
              <p className="text-xs text-base-content/50 text-right">
                {form.bio.length}/{LIMITS.BIO_MAX}
              </p>
            </div>

            <div>
              <label className="text-sm text-base-content/60 block mb-1" htmlFor="profile-gender">
                Gender
              </label>
              <select
                id="profile-gender"
                className="select select-bordered w-full bg-base-200"
                {...field("gender")}
              >
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {GENDER_LABELS[g]}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isUpdatingProfile || !dirty}
            >
              {isUpdatingProfile ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </form>

          <div className="bg-base-200 rounded-xl p-6">
            <h2 className="text-lg font-medium mb-4">Account Information</h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between py-2 border-b border-base-300">
                <span>Member since</span>
                <span>
                  {authUser.createdAt ? new Date(authUser.createdAt).toLocaleDateString() : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span>Account status</span>
                <span className="text-success capitalize">{authUser.status}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
