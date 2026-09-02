import PwaInstaller from "./pwa-installer";

export default function Home() {
  return (
    <main className="site-shell">
      <iframe
        className="app-frame"
        src="/app-fragment.html"
        title="What to Eat 家庭食品管家"
        allow="camera"
        referrerPolicy="no-referrer"
      />
      <PwaInstaller />
    </main>
  );
}
