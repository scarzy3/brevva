export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>Brevva</h1>
      <p>Property management dashboard — coming soon.</p>
      <p style={{ color: "#666", fontSize: "0.875rem" }}>
        API: <code>{process.env.NEXT_PUBLIC_API_URL ?? "/api/v1"}</code>
      </p>
    </main>
  );
}
