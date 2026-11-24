"use client";

import { registerRequestSchema } from "@twitter-clone/contracts";
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
import { useRegister } from "../lib/session";

import { buttonClass, formClass, headingClass } from "./styles";
import { TextField } from "./text-field";
import { useFocusFirstError } from "./use-focus-first-error";

import { Alert, AlertDescription } from "@/components/ui/alert";

function readForm(form: HTMLFormElement) {
  const data = new FormData(form);
  const value = (name: string) => String(data.get(name) ?? "");
  const displayName = value("displayName");
  return {
    email: value("email"),
    password: value("password"),
    username: value("username"),
    ...(displayName.trim().length === 0 ? {} : { displayName }),
  };
}

/** Registration form (US-A01): validates locally with the shared contract. */
export function RegisterForm() {
  const router = useRouter();
  const register = useRegister();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  useFocusFirstError(formRef, errors);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = registerRequestSchema.safeParse(
      readForm(event.currentTarget),
    );
    if (!parsed.success) {
      setErrors({
        fields: zodFieldErrors(parsed.error),
        form: "Fix the highlighted fields.",
      });
      return;
    }
    setErrors(NO_ERRORS);
    register.mutate(parsed.data, {
      onError: (error) => setErrors(apiFormErrors(error)),
      onSuccess: () => router.replace("/home"),
    });
  }

  return (
    <form
      aria-labelledby="register-heading"
      className={formClass}
      // POST, so a submit before hydration never puts credentials in the URL.
      method="post"
      noValidate
      onSubmit={onSubmit}
      ref={formRef}
    >
      <h1 className={headingClass} id="register-heading">
        Create your account
      </h1>
      <p className="text-muted-foreground">Accounts and posts are public.</p>
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
        autoComplete="username"
        errors={errors.fields.username}
        hint="3–30 letters, digits, or underscores, starting with a letter."
        label="Username"
        name="username"
        required
      />
      <TextField
        autoComplete="name"
        errors={errors.fields.displayName}
        hint="Optional. Defaults to your username."
        label="Display name"
        name="displayName"
      />
      <TextField
        autoComplete="new-password"
        errors={errors.fields.password}
        hint="10–128 characters."
        label="Password"
        name="password"
        required
        type="password"
      />
      <button
        aria-busy={register.isPending}
        className={buttonClass}
        disabled={register.isPending}
        type="submit"
      >
        {register.isPending ? "Creating account…" : "Create account"}
      </button>
      <p>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </form>
  );
}
