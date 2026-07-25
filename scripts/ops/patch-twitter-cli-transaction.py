#!/usr/bin/env python3
"""Restore x-client-transaction-id for the host `twitter` CLI.

WHY
---
X rejects some writes with error 226 ("This request looks like it might be
automated"). The strongest signal behind that verdict is a missing
`x-client-transaction-id` header, and twitter-cli stopped being able to send it:

  WARNING twitter_cli.client: Failed to init ClientTransaction:
  'NoneType' object has no attribute 'group'

The upstream `xclienttransaction` lib builds that header from the webpack chunk
map on x.com's homepage, keyed off the marker `,<idx>:"ondemand.s"`. twitter-cli
fetches `https://x.com` with NO cookies, and X now serves logged-out visitors a
rewritten client (`abs.twimg.com/x-web/x-web/entry-client-logged-out-*.js`) that
contains no such marker — so the regex matches nothing and `.group(1)` raises.

Measured 2026-07-25 from the production box:
  logged out  https://x.com       -> 34,967 bytes, 'ondemand.s' absent
  logged in   https://x.com/home  -> 271,148 bytes, 'ondemand.s' PRESENT
                                     (chunk 59924, responsive-web bundles)

So the data is still there — twitter-cli is just asking as the wrong user.
This patch makes ClientTransaction init send the session cookies and hit /home.
Upgrading the lib does NOT help: 1.0.3 is latest and fails identically.

USAGE
-----
  python3 scripts/ops/patch-twitter-cli-transaction.py [--check]

Idempotent. `--check` exits 1 if the patch is missing (wire it into preflight),
0 if present. Re-run after any `pipx upgrade twitter-cli`.
"""

import argparse
import glob
import shutil
import sys
import time

MARKER = "# trendingrepo-patch: authed CT init"

ANCHOR = '''            home_page = cffi_session.get(
                "https://x.com", headers=ct_headers, timeout=10,
            )'''

REPLACEMENT = f'''            {MARKER} — logged-out x.com no longer carries the
            # `ondemand.s` chunk marker the transaction id is derived from, so
            # ask as the authenticated user (which still serves responsive-web).
            _tr_cookie = getattr(self, "_cookie_string", None) or (
                "auth_token=%s; ct0=%s"
                % (getattr(self, "_auth_token", ""), getattr(self, "_ct0", ""))
            )
            if _tr_cookie and "auth_token=" in _tr_cookie:
                ct_headers = dict(ct_headers)
                ct_headers["Cookie"] = _tr_cookie
                _tr_url = "https://x.com/home"
            else:
                _tr_url = "https://x.com"
            home_page = cffi_session.get(
                _tr_url, headers=ct_headers, timeout=10,
            )'''


def find_client_py():
    hits = glob.glob(
        "/root/.local/share/pipx/venvs/twitter-cli/lib/python*/site-packages/twitter_cli/client.py"
    )
    if not hits:
        sys.exit("FATAL: twitter_cli/client.py not found in the pipx venv")
    return hits[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report status, change nothing")
    args = ap.parse_args()

    path = find_client_py()
    with open(path, encoding="utf-8") as fh:
        src = fh.read()

    if MARKER in src:
        print(f"OK: patch already present in {path}")
        return 0
    if args.check:
        print(f"MISSING: x-client-transaction-id patch absent from {path}")
        print("  fix: python3 scripts/ops/patch-twitter-cli-transaction.py")
        return 1
    if ANCHOR not in src:
        sys.exit(
            "FATAL: anchor not found — twitter-cli changed shape.\n"
            "Re-read _ensure_client_transaction() in " + path
        )

    backup = f"{path}.bak-{int(time.time())}"
    shutil.copy2(path, backup)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(src.replace(ANCHOR, REPLACEMENT, 1))
    print(f"PATCHED {path}\n  backup: {backup}")
    print("  verify: twitter --compact status  (the ClientTransaction warning should be gone)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
