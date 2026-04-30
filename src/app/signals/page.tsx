// TEMP minimal /signals page for Vercel 500 diagnostic. The full V3
// newsroom implementation is in git at commit 9b151b3a (and later); will
// restore as soon as we know whether the failure is in module-load (my
// imports) or layout/build.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SignalsPage() {
  return (
    <main style={{ padding: 24, fontFamily: "monospace", fontSize: 14 }}>
      <h1 style={{ color: "#ff6b35" }}>/signals minimal diagnostic</h1>
      <p>If you can read this on the Vercel preview, module-load is fine and</p>
      <p>the V3 newsroom failure is somewhere in the import / render tree.</p>
      <p>Built at: {new Date().toISOString()}</p>
    </main>
  );
}
