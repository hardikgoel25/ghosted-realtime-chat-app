import { Users } from "lucide-react";
import { initialsOf } from "../../lib/utils";

const SIZES = {
  xs: "size-7 text-[11px]",
  sm: "size-9 text-sm",
  md: "size-11 text-base",
  lg: "size-14 text-lg",
  xl: "size-24 text-3xl",
};
const DOTS = { xs: "size-2", sm: "size-2.5", md: "size-3", lg: "size-3.5", xl: "size-5" };
const ICONS = { xs: "size-3.5", sm: "size-4", md: "size-5", lg: "size-6", xl: "size-10" };

/**
 * User (or group) avatar with an optional presence dot. Pass `online` only when presence is
 * known. A `user.group` flag without a photo shows a people icon instead of initials.
 */
export default function Avatar({ user, size = "md", online, className = "" }) {
  const url = user?.avatar?.url;
  return (
    <div className={`relative shrink-0 ${className}`}>
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          loading="lazy"
          className={`${SIZES[size]} rounded-full object-cover bg-base-300`}
        />
      ) : (
        <div
          className={`${SIZES[size]} rounded-full bg-primary/15 text-primary font-semibold flex items-center justify-center`}
          aria-hidden="true"
        >
          {user?.group ? <Users className={ICONS[size]} /> : initialsOf(user?.fullname)}
        </div>
      )}
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 ${DOTS[size]} rounded-full ring-2 ring-base-100 ${
            online ? "bg-success" : "bg-base-content/25"
          }`}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
