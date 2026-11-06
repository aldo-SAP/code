/** Shown while a page loads, so navigating on a slow phone gives feedback instead of a frozen screen. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading">
      <div className="skel" style={{ width: "40%", height: 26, marginBottom: 18 }} />
      <div className="skel" style={{ height: 70, marginBottom: 12 }} />
      <div className="skel" style={{ height: 70, marginBottom: 12 }} />
      <div className="skel" style={{ height: 70 }} />
      <span className="sr-only">Loading...</span>
    </div>
  );
}
