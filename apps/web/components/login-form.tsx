"use client";

import { loginRequestSchema } from "@twitter-clone/contracts";
import { CircleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";

import {
  apiFormErrors,
  type FormErrors,
  NO_ERRORS,
  zodFieldErrors,
} from "../lib/form-errors";
import { useLogIn } from "../lib/session";

import { TextField } from "./text-field";
import { useFocusFirstError } from "./use-focus-first-error";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";

/**
 * Login form (US-A02). Wrong credentials show the API's single generic
 * message, never a hint about which field was wrong (AC-A02.2).
 */
export function LoginForm() {
  const router = useRouter();
  const logIn = useLogIn();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  useFocusFirstError(formRef, errors);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = loginRequestSchema.safeParse({
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
    });
    if (!parsed.success) {
      setErrors({
        fields: zodFieldErrors(parsed.error),
        form: "Enter your email and password.",
      });
      return;
    }
    setErrors(NO_ERRORS);
    logIn.mutate(parsed.data, {
      onError: (error) => setErrors(apiFormErrors(error)),
      onSuccess: () => router.replace("/home"),
    });
  }

  return (
    <form
      aria-labelledby="login-heading"
      // POST, so a submit before hydration never puts credentials in the URL.
      method="post"
      noValidate
      onSubmit={onSubmit}
      ref={formRef}
    >
      <Card>
        <CardHeader>
          <CardTitle>
            <h1
              className="text-2xl leading-tight font-semibold"
              id="login-heading"
            >
              Log in
            </h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {errors.form === null ? null : (
              <Alert variant="destructive">
                <CircleAlertIcon aria-hidden="true" />
                <AlertDescription>{errors.form}</AlertDescription>
              </Alert>
            )}
            <TextField
              autoComplete="email"
              errors={errors.fields.email}
              label="Email"
              name="email"
              required
              type="email"
            />
            <TextField
              autoComplete="current-password"
              errors={errors.fields.password}
              label="Password"
              name="password"
              required
              type="password"
            />
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-3">
          <Button
            aria-busy={logIn.isPending}
            className="w-full"
            disabled={logIn.isPending}
            size="lg"
            type="submit"
          >
            {logIn.isPending ? "Logging in…" : "Log in"}
          </Button>
          <p>
            New here? <Link href="/register">Create an account</Link>
          </p>
        </CardFooter>
      </Card>
    </form>
  );
}
