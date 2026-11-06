import "./globals.css";
export const metadata = { title: "Talent CRM/ERP" };
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
