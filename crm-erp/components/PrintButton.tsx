"use client";
export default function PrintButton() {
  return <button type="button" className="sec" onClick={() => window.print()}>Print / PDF</button>;
}
