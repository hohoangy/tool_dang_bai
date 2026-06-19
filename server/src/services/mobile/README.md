# Mobile automation services

Public callers should import the focused service that matches their use case:

- `device-automation.service.js`: LDPlayer/ADB lifecycle and remote controls.
- `facebook-automation.service.js`: Facebook publishing workflow.
- `instagram-automation.service.js`: Instagram publishing workflow.
- `login-automation.service.js`: login workflow, credential helpers, and batch jobs.
- `automation.service.js`: compatibility facade for legacy callers.
- `automation-runtime.service.js`: compatibility facade for callers using the old runtime path.

Supporting modules:

- `mobile-command.service.js`: command execution and executable discovery.
- `mobile-secret.service.js`: mobile credential encryption.
- `mobile-log.service.js`: automation log persistence.
- `mobile-account.service.js`: safe account serialization.
- `mobile-login-job.service.js`: in-memory batch login jobs.

`automation-engine.service.js` contains the shared Facebook, Instagram, login, and
UI-state-machine implementation. It is internal; routes and new services should
not import it directly.
