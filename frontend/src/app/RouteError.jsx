import { Link, useRouteError } from "react-router-dom";
import { Ghost } from "lucide-react";

export default function RouteError() {
  const error = useRouteError();
  const notFound = error?.status === 404;
  return (
    <div className="h-dvh flex items-center justify-center p-6 bg-base-200">
      <div className="surface p-8 max-w-md text-center space-y-4">
        <div className="mx-auto size-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Ghost className="size-7 text-primary" />
        </div>
        <h1 className="text-xl font-semibold">
          {notFound ? "Page not found" : "Something went wrong"}
        </h1>
        <p className="text-sm text-base-content/70">
          {notFound
            ? "That link leads nowhere. It may have been moved or never existed."
            : (error?.message ?? "An unexpected error occurred.")}
        </p>
        <Link to="/" className="btn btn-primary">
          Back to chats
        </Link>
      </div>
    </div>
  );
}
