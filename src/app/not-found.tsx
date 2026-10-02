import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="font-mono text-caption text-muted-foreground">404</p>
      <h1 className="text-h1 font-semibold">Page not found</h1>
      <p className="text-muted-foreground">The page you requested does not exist.</p>
      <Link href="/command-center" className="font-medium underline underline-offset-4">
        Go to Command Center
      </Link>
    </main>
  );
}
