import Link from "next/link";
export default function NotFound() {
  return (
    <div className="card">
      <h1>We could not find that</h1>
      <p>It may have been removed, or the link is incomplete.</p>
      <Link className="btn" href="/">Go to the start page</Link>
    </div>
  );
}
