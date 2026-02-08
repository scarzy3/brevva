export const metadata = {
  title: "Brevva - Property Management",
  description: "Property management dashboard for landlords and property managers",
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
