import { useState, useEffect } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { Camera, User } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ProfilePage = () => {
  const { authUser, isUpdatingProfile, updateProfile, checkAuth } = useAuthStore();
  const [selectedImg, setSelectedImg] = useState(null);
  const [bio, setBio] = useState("");
  const [gender, setGender] = useState("prefer not to say");
  const navigate = useNavigate();

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = async () => {
      const base64Image = reader.result;
      setSelectedImg(base64Image);
      await updateProfile({ profilePic: base64Image, bio, gender });
    };
  };

  // Optional: update bio/gender with a Save button
  const handleSave = async () => {
    await updateProfile({ bio, gender });
  };

  useEffect(() => {
    checkAuth(); // refetch latest data
  }, []);

  useEffect(() => {
    if (authUser) {
      setBio(authUser.bio || "");
      setGender(authUser.gender || "prefer not to say");
    }
  }, [authUser]);

  if (!authUser) return <div className="text-center mt-10">Loading profile...</div>;

  return (
    <div className="min-h-screen pt-20">
      <div className="max-w-2xl mx-auto p-4 pb-8 pt-2">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-sm text-white-600 hover:underline mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </button>
        <div className="bg-base-300 rounded-xl p-6 space-y-8">
          <div className="text-center">
            <h1 className="text-2xl font-semibold">Profile</h1>
            <p className="mt-2">Your profile information</p>
          </div>

          {/* Avatar Upload Section */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <img
                src={selectedImg || authUser.profilePic || "/avatar.png"}
                alt="Profile"
                className="size-32 rounded-full object-cover border-4"
              />
              <label
                htmlFor="avatar-upload"
                className={`
                  absolute bottom-0 right-0
                  bg-base-content hover:scale-105
                  p-2 rounded-full cursor-pointer
                  transition-all duration-200
                  ${isUpdatingProfile ? "animate-pulse pointer-events-none" : ""}
                `}
              >
                <Camera className="w-5 h-5 text-base-200" />
                <input
                  type="file"
                  id="avatar-upload"
                  className="hidden"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={isUpdatingProfile}
                />
              </label>
            </div>
            <p className="text-sm text-zinc-400">
              {isUpdatingProfile
                ? "Uploading..."
                : "Click the camera icon to update your photo"}
            </p>
          </div>

          {/* Display fullname and username readonly */}
          <div className="space-y-6">
            <div className="space-y-1.5">
              <div className="text-sm text-zinc-400 flex items-center gap-2 lowercase">
                <User className="w-4 h-4" />
                Fullname
              </div>
              <p className="px-4 py-2.5 bg-base-200 rounded-lg border opacity-70 blur-[0.5px] cursor-not-allowed select-none">
                {authUser?.fullname}
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="text-sm text-zinc-400 flex items-center gap-2">
                <User className="w-4 h-4" />
                Username
              </div>
              <p className="px-4 py-2.5 bg-base-200 rounded-lg border opacity-70 blur-[0.5px] cursor-not-allowed select-none">
                {authUser?.username}
              </p>
            </div>
          </div>

          {/* Editable bio */}
          <div>
            <label className="text-sm text-zinc-400 block mb-1">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full rounded-lg border p-2 bg-base-200 text-zinc-50 text-sm resize-none"
              maxLength={160}
              rows={3}
              disabled={isUpdatingProfile}
            />
          </div>

          {/* Editable gender */}
          <div>
            <label className="text-sm text-zinc-400 block mb-1">Gender</label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="w-full rounded-lg border p-2 text-zinc-50 bg-base-200 text-sm"
              disabled={isUpdatingProfile}
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="prefer not to say">Prefer not to say</option>
            </select>
          </div>

          <button
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            onClick={handleSave}
            disabled={isUpdatingProfile}
          >
            {isUpdatingProfile ? "Saving..." : "Save Changes"}
          </button>

          <div className="mt-6 bg-base-300 rounded-xl p-6">
            <h2 className="text-lg font-medium mb-4">Account Information</h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between py-2 border-b border-zinc-700">
                <span>Member Since</span>
                <span>{authUser?.createdAt?.split("T")[0]}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span>Account Status</span>
                <span className="text-green-500">Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
