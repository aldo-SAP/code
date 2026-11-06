"use client";
import Link from "next/link";

/** Something went wrong while loading a page: say what happened and give a way forward. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card" role="alert">
      <h1>Something went wrong</h1>
      <p>We could not load this page. Your data is safe. Try again, and if it keeps happening tell an admin{error.digest ? ` and mention reference ${error.digest}` : ""}.</p>
      <div className="row"><button onClick={() => reset()}>Try again</button><Link className="btn sec" href="/">Go to the start page</Link></div>
    </div>
  );
}
