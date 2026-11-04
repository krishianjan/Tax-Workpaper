"use client";
import { useRouter } from "next/navigation";

// Landing-page CTA: clears the tour-dismissed flag then navigates to /overview
// so the GuidedTour component mounts fresh and shows itself.
export function TourTrigger({ children, className, "data-testid": testId }: { children: React.ReactNode; className?: string; "data-testid"?: string }) {
  const router = useRouter();
  return (
    <button
      className={className}
      data-testid={testId}
      onClick={() => {
        try { localStorage.removeItem("miraflores_tour_v1"); } catch { /* private mode */ }
        router.push("/overview");
      }}
    >
      {children}
    </button>
  );
}
