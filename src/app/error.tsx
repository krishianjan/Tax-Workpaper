"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 max-w-md w-full">
        <h2 className="text-lg font-semibold text-red-800 mb-1">Something went wrong</h2>
        <p className="text-sm text-red-600 mb-4">
          {error.message?.includes("422")
            ? "The form data was invalid. Check all required fields and try again."
            : error.message?.includes("403")
            ? "You don't have permission to do that with your current role."
            : error.message?.includes("404")
            ? "That record no longer exists."
            : error.message?.includes("409")
            ? "This return is frozen — no changes are allowed after filing."
            : "An unexpected error occurred on the server."}
        </p>
        {error.digest && (
          <p className="text-xs text-slate-400 mb-4">Digest: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="rounded bg-red-700 px-4 py-2 text-sm text-white hover:bg-red-800"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
