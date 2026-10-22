export default function EmptyState({ icon: Icon, title, description, action, className = "" }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center p-8 gap-3 ${className}`}>
      {Icon && (
        <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Icon className="size-7 text-primary" />
        </div>
      )}
      {title && <h3 className="font-semibold">{title}</h3>}
      {description && <p className="text-sm text-base-content/60 max-w-xs">{description}</p>}
      {action}
    </div>
  );
}
