"use client";

import { CircleAlertIcon } from "lucide-react";
import { useEffect } from "react";

import { PageShell } from "@/components/page-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface RootErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/** Catches unexpected rendering errors beneath the root layout (FND-03). */
export default function RootError({ error, reset }: RootErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageShell>
      <Alert variant="destructive">
        <CircleAlertIcon aria-hidden="true" />
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription>
          We could not load this page. Try again, or return to the landing page.
        </AlertDescription>
      </Alert>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={() => reset()} type="button">
          Try again
        </Button>
        <Button
          onClick={() => {
            window.location.href = "/";
          }}
          type="button"
          variant="outline"
        >
          Go home
        </Button>
      </div>
    </PageShell>
  );
}
