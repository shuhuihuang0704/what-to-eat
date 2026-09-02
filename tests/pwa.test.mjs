import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("Windows users can install the app as a PWA", async () => {
  const [manifestSource, layout, page, installer, serviceWorker] = await Promise.all([
    readFile(new URL("public/manifest.webmanifest", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/pwa-installer.tsx", root), "utf8"),
    readFile(new URL("public/sw.js", root), "utf8"),
  ]);

  const manifest = JSON.parse(manifestSource);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.scope, "/");
  assert.match(manifest.start_url, /^\//);
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));

  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.match(page, /<PwaInstaller\s*\/>/);
  assert.match(installer, /beforeinstallprompt/);
  assert.match(installer, /navigator\.serviceWorker\.register\("\/sw\.js"\)/);
  assert.match(installer, /安装到 Windows/);
  assert.match(serviceWorker, /self\.addEventListener\("install"/);
  assert.match(serviceWorker, /self\.addEventListener\("fetch"/);
});
