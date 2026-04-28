// TrendingRepo — /.well-known/security.txt
//
// RFC 9116-compliant disclosure pointer for security researchers.
// Tells anyone probing the well-known prefix where to report
// vulnerabilities and how long this contact stays valid.
// Spec: https://www.rfc-editor.org/rfc/rfc9116

export const dynamic = "force-static";
export const revalidate = 86400;

export function GET() {
  const body = `Contact: mailto:security@trendingrepo.com
Expires: 2027-01-01T00:00:00.000Z
Preferred-Languages: en
Canonical: https://trendingrepo.com/.well-known/security.txt
`;
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
