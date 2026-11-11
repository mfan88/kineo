// The app shell. Screens (Home and the ones it leads to) are added in the
// navigation task; until then the window shows the product name.
export default function App() {
  return (
    <main className="grid min-h-screen place-items-center bg-background text-foreground">
      <h1 className="text-[28px] font-semibold">Kineō</h1>
    </main>
  );
}
