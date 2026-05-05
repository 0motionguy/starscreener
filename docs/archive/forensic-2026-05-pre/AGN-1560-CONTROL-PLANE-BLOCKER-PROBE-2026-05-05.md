# AGN-1560 control-plane blocker probe
- timestamp_utc: 2026-05-05T03:36:48.597Z
- paperclip_api_url: http://192.168.192.1:3100
- run_id: b46dff38-3295-4547-831e-f99081e0f063

## Probe 1: Invoke-RestMethod GET /api/health
error: Unable to connect to the remote server

## Probe 2: curl /api/health
output: curl: (7) Failed to connect to 192.168.192.1 port 3100 after 2010 ms: Could not connect to server