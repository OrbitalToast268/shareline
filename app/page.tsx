export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        padding: 20,
        gap: 16,
        maxWidth: 520,
        margin: "0 auto",
        justifyContent: "center",
      }}
    >
      <header style={{ marginBottom: 8 }}>
        <h1 style={{ fontSize: 40, margin: 0, letterSpacing: -0.8 }}>
          ShareLine
        </h1>
        <p style={{ marginTop: 10, color: "#555", lineHeight: 1.4 }}>
          A simple meeting queue for in-person shares. No accounts. No history.
          Just the line.
        </p>
      </header>

      <a
        href="/chair"
        style={{
          display: "block",
          textAlign: "center",
          padding: "18px 16px",
          borderRadius: 14,
          background: "black",
          color: "white",
          fontSize: 18,
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        Start a Meeting (Chair)
      </a>

      <a
        href="/join"
        style={{
          display: "block",
          textAlign: "center",
          padding: "18px 16px",
          borderRadius: 14,
          border: "2px solid #ddd",
          background: "white",
          color: "black",
          fontSize: 18,
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        Enter Code (Member)
      </a>

      <footer style={{ marginTop: 20, color: "#777", fontSize: 13 }}>
        Tip: Add this to your Home Screen so you never scan a QR again.
      </footer>
    </main>
  );
}