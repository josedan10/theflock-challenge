import { PageShell } from "../../components/page-shell";
import { RegisterForm } from "../../components/register-form";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Create account · Twitter Clone" };

export default function RegisterPage() {
  return (
    <PageShell>
      <RegisterForm />
    </PageShell>
  );
}
