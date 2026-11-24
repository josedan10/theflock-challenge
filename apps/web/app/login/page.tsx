import { LoginForm } from "../../components/login-form";
import { PageShell } from "../../components/page-shell";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Log in · Twitter Clone" };

export default function LoginPage() {
  return (
    <PageShell>
      <LoginForm />
    </PageShell>
  );
}
