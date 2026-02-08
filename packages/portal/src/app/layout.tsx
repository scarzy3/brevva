export const metadata = {
  title: "Brevva - Tenant Portal",
  description: "Tenant portal for rent payments, maintenance requests, and communication",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
