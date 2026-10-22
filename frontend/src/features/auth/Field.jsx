export default function Field({
  id,
  label,
  icon: Icon,
  error,
  hint,
  right,
  children,
  className = "",
  ...inputProps
}) {
  const describedBy = error || hint ? `${id}-hint` : undefined;
  return (
    <div className={`w-full ${className}`}>
      <label className="block text-sm font-medium mb-1.5" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon
            className="size-4 text-base-content/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
        )}
        <input
          id={id}
          className={`input w-full ${Icon ? "pl-9" : ""} ${right ? "pr-10" : ""} ${error ? "input-error" : ""}`}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          {...inputProps}
        />
        {right && (
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center">
            {right}
          </div>
        )}
      </div>
      {(error || hint) && (
        <p
          id={describedBy}
          className={`text-xs mt-1 ${error ? "text-error" : "text-base-content/50"}`}
        >
          {error || hint}
        </p>
      )}
      {children}
    </div>
  );
}
