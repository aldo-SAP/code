/** Page title with a short description on the left and the one main action on the right. */
export default function PageHead({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return <div className="pagehead"><div><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>{children && <div className="pagehead-act">{children}</div>}</div>;
}
