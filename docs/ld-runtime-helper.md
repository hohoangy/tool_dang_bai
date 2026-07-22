# LD Runtime Helper

LDPlayer/ADB must be treated as a separate runtime layer. The backend can call this helper instead of spawning LDPlayer directly.

## Start Helper

Run this in an interactive desktop terminal:

```powershell
npm run ld:helper
```

Keep the terminal open while testing or posting.

## Backend Env

Add this to `.env` when using the helper:

```env
LD_RUNTIME_HELPER_URL=http://127.0.0.1:5279
```

The backend will try the helper first. If the helper is not reachable or cannot attach ADB, the backend falls back to the internal LD launch flow.

## Health Check

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:5279/health -Method Get
```

Expected:

```json
{"ok":true,"service":"ld-runtime-helper","port":5279}
```

## Why This Exists

LDPlayer can create a Windows process without exposing an ADB device when launched from a backend child process. The helper must run in the interactive desktop session so LDPlayer, LDBox service, and ADB attach in a predictable layer before Facebook/Instagram automation starts.
