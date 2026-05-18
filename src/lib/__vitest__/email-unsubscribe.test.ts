import { afterEach, describe, expect, it } from "vitest";

import {
  buildEmailUnsubscribeUrl,
  verifyEmailUnsubscribeToken,
} from "@/lib/email/unsubscribe";
import { renderWelcomeEmail } from "@/lib/email/templates/welcome";

const priorSecret = process.env.SESSION_SECRET;

afterEach(() => {
  if (priorSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = priorSecret;
});

describe("email unsubscribe links", () => {
  it("builds and verifies scoped profile unsubscribe tokens", () => {
    process.env.SESSION_SECRET = "test-secret-" + "s".repeat(40);
    const profileId = "11111111-1111-4111-8111-111111111111";

    const url = new URL(buildEmailUnsubscribeUrl("system", profileId));
    expect(url.pathname).toBe("/api/email/unsubscribe");
    expect(url.searchParams.get("scope")).toBe("system");
    expect(url.searchParams.get("p")).toBe(profileId);

    const token = url.searchParams.get("t");
    expect(token).toBeTruthy();
    expect(verifyEmailUnsubscribeToken("system", profileId, token!)).toBe(
      true,
    );
    expect(
      verifyEmailUnsubscribeToken("referral_updates", profileId, token!),
    ).toBe(false);
  });

  it("keeps welcome email unsubscribe on the account-email route", () => {
    process.env.SESSION_SECRET = "test-secret-" + "s".repeat(40);
    const rendered = renderWelcomeEmail({
      handle: "operator",
      profileId: "22222222-2222-4222-8222-222222222222",
      firstName: "<Mirko>",
    });

    expect(rendered.html).toContain("/api/email/unsubscribe?");
    expect(rendered.html).toContain("scope=system");
    expect(rendered.html).not.toContain("kind=system");
    expect(rendered.html).not.toContain("sig=");
    expect(rendered.html).toContain("Hey &lt;Mirko&gt;");
  });
});
