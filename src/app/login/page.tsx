import { redirect } from "next/navigation";
import {
  getSession,
  checkPassword,
  createSession,
  setSessionCookie,
} from "@/lib/auth";

export default async function LoginPage() {
  const isAuthenticated = await getSession();
  if (isAuthenticated) redirect("/");

  async function login(formData: FormData) {
    "use server";
    const password = formData.get("password") as string;
    if (!checkPassword(password)) {
      redirect("/login?error=1");
    }
    const token = await createSession();
    await setSessionCookie(token);
    redirect("/");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[var(--color-sidebar-bg)]">
      {/* Subtle radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(196,125,46,0.08) 0%, transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-sm px-6">
        {/* Logo / brand mark */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)]">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-amber)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
          </div>
          <h1
            className="text-2xl tracking-tight text-[var(--color-sidebar-text)]"
            style={{ fontFamily: "var(--font-libre-baskerville)" }}
          >
            Places
          </h1>
          <p className="mt-1 text-sm text-[var(--color-sidebar-muted)]">
            Your personal map of the world
          </p>
        </div>

        <form action={login} className="space-y-4">
          <div className="relative">
            <input
              type="password"
              name="password"
              placeholder="Enter password"
              required
              autoFocus
              className="w-full rounded-lg border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] px-4 py-3 text-sm text-[var(--color-sidebar-text)] placeholder-[var(--color-sidebar-muted)] transition-colors focus:border-[var(--color-amber)] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-[var(--color-amber)] px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-[var(--color-amber-light)] focus:outline-none focus:ring-2 focus:ring-[var(--color-amber)] focus:ring-offset-2 focus:ring-offset-[var(--color-sidebar-bg)]"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
