// The app shell. Screens (Home and the ones it leads to) are added in the
// navigation task; until then the window shows the product name.
export default function App() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        margin: 0,
        background: "#F7FBFF",
        color: "#11181C",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>Kineō</h1>
    </main>
  );
}
