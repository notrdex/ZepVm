# ZepVm

A small browser-based PTY terminal with a dark mobile-friendly UI.

## Render

1. Upload this project to GitHub.
2. In Render, create a **Web Service** from the repository.
3. Build command:
   `npm install`
4. Start command:
   `npm start`
5. Add an environment variable:
   `ZEPVM_PASSWORD` = your private terminal password.
6. Deploy.

## Important

This terminal runs commands inside the Render service itself. Render's normal web service is **not** an unrestricted VPS and the process should not be assumed to be root. The `ZepVm` hostname shown by the UI is a label; it does not grant root privileges.

The terminal is protected by the `ZEPVM_PASSWORD` login. Do not deploy a public shell without authentication.
