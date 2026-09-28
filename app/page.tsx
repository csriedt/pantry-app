import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Pantry</h1>
      <p className="text-sm text-muted-foreground">
        The pet-store sandbox and service-flow demo live here.
      </p>
      <Link
        href="/sandbox"
        className="rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-muted"
      >
        Open the sandbox
      </Link>
    </main>
  );
}
