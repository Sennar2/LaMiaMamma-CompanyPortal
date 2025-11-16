// app/maintenance/layout.tsx
export default function MaintenanceLayout({ children }: { children: React.ReactNode }) {
  // swap these classes to your site’s container if needed
  return <section className="container mx-auto max-w-6xl px-4 py-6">{children}</section>;
}
