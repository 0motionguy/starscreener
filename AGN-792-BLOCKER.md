# AGN-792 BLOCKER — AISO API Rate Limit

Date: 2026-05-04 21:36:50 UTC
Issue: AGN-792

## Block condition
- Required step (POST https://aiso.tools/api/scan for https://trendingrepo.com) returns:
  - HTTP 429 Too Many Requests
  - error=rate_limited_ip
  - etryAfterSeconds=67823

Raw evidence file:
- docs/forensic/AGN-792-AISO-POST-20260504T213640Z.txt

## Unblock ownership
- Unblock owner: AISO API rate-limit window
- Unblock action: re-run the same POST after retry window
- Earliest retry (UTC): 2026-05-05 16:27:13 UTC

## Immediate next action once unblocked
1. Submit scan.
2. Poll /api/scan/<scanId> until terminal status.
3. Record 9-dimension scorecard in docs/forensic/13-AISO-SELF-SCAN.md.
4. Implement lowest-dimension fix and re-scan for >=10 improvement.
