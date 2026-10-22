export default function Toggle({ label, description, checked, onChange, disabled }) {
  return (
    <label className="flex items-start justify-between gap-4 py-3 cursor-pointer">
      <span>
        <span className="block font-medium">{label}</span>
        {description && <span className="block text-sm text-base-content/60">{description}</span>}
      </span>
      <input
        type="checkbox"
        className="toggle toggle-primary mt-0.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
    </label>
  );
}
