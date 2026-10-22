const SIZES = { sm: "loading-sm", md: "loading-md", lg: "loading-lg" };

export default function Spinner({ size = "md", label = "Loading", className = "" }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`loading loading-spinner ${SIZES[size]} text-primary ${className}`}
    />
  );
}
