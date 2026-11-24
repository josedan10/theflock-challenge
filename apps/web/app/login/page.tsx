import { LoginForm } from "../../components/login-form";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Log in · Twitter Clone" };

export default function LoginPage() {
  return (
    <main>
      <section>
        <LoginForm />
      </section>
    </main>
  );
}
