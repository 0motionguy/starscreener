# AGN-378 blocker evidence - Paperclip issue write path

Date (UTC): 2026-05-05

## Summary

AGN-378 verification payload is complete, but control-plane issue write operations still fail with HTTP 500, preventing required closeout writes.

## Endpoint checks

- `GET http://127.0.0.1:3100/api/health` -> `200 OK`
- `PATCH http://127.0.0.1:3100/api/issues/{issueId}` -> `500 Internal Server Error`
- `POST http://127.0.0.1:3100/api/issues/{issueId}/comments` -> `500 Internal Server Error`
- `POST http://127.0.0.1:3100/api/companies/{companyId}/issues` -> `500 Internal Server Error`

Remote configured base URL also fails transport-level connect:

- `http://192.168.192.1:3100` -> connection failure (`curl: (7) Could not connect to server`)

## Impact

- Cannot post acceptance comment containing probe output + `stddev/mean` + verdict + commit SHA.
- Cannot create required P1 follow-up issue for rotation-bias investigation.
- Cannot send terminal issue PATCH (`done` or `blocked`) from this agent session.

## Unblock owner/action

- Owner: Paperclip platform/control-plane
- Action: restore `/api/issues*` and `/api/companies/*/issues` write handlers, then rerun AGN-378 closeout writes.
