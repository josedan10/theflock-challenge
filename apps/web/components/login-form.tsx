"use client";

import { loginRequestSchema } from "@twitter-clone/contracts";
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

import { FormAlert } from "./form-alert";
import { TextField } from "./text-field";
import { useFocusFirstError } from "./use-focus-first-error";

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
      noValidate
      onSubmit={onSubmit}
      ref={formRef}
    >
      <h1 id="login-heading">Log in</h1>
      <FormAlert message={errors.form} />
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
      <button
        aria-busy={logIn.isPending}
        disabled={logIn.isPending}
        type="submit"
      >
        {logIn.isPending ? "Logging in…" : "Log in"}
      </button>
      <p>
        New here? <Link href="/register">Create an account</Link>
      </p>
    </form>
  );
}
