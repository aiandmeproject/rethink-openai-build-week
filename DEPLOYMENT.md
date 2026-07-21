# Deploying Rethink Core v0.1

## Recommended path: Render with Docker

The simplest public deployment for the current dependency-free Node server is a single containerized web service. The included `Dockerfile` and `render.yaml` keep the frontend and API on one origin, keep the OpenAI key server-side, and expose `/api/health` for platform checks.

The Blueprint fields follow Render's current [Blueprint YAML reference](https://render.com/docs/blueprint-spec). Render documents both [Docker-based services](https://render.com/docs/docker) and the requirement that a public web service bind to `0.0.0.0` and the platform-provided port in its [Web Services guide](https://render.com/docs/web-services).

1. Push this repository to a private or public Git host.
2. In Render, create a Blueprint from the repository. Render will read `render.yaml`.
3. Set `OPENAI_API_KEY` as a secret environment variable if Live Mode is required.
4. Deploy and confirm `https://YOUR-SERVICE/api/health` returns `{"status":"ok"...}`.
5. Open the service URL, run the deterministic sample, reload once, and test project export/import.

Do not put `OPENAI_API_KEY` in `public/`, client JavaScript, a committed `.env`, or a build argument. The browser only talks to the same-origin Rethink API.

## Configuration

| Variable | Development default | Production guidance |
| --- | --- | --- |
| `NODE_ENV` | `development` | Set to `production` |
| `HOST` | `127.0.0.1` | Omit; production defaults to `0.0.0.0` |
| `PORT` | `3000` | Let the host inject it |
| `OPENAI_API_KEY` | empty | Secret; omit for Demo-only deployment |
| `OPENAI_MODEL` | `gpt-5.6-sol` | Keep or deliberately override |
| `OPENAI_REASONING_EFFORT` | `medium` | Keep or deliberately override |

Production start command: `npm run start:production`. Demo Mode remains usable without a key.

## Docker locally

```bash
docker build -t rethink-core:0.1 .
docker run --rm -p 3000:3000 --env-file .env rethink-core:0.1
```

Then open `http://127.0.0.1:3000` and check `http://127.0.0.1:3000/api/health`.

## Other supported options

Any platform that runs a Node 20+ process or the supplied OCI container can host v0.1, including Railway, Fly.io, a small VM, or a container service. It must:

- route HTTPS traffic to the injected `PORT`;
- preserve server-side environment variables;
- allow outbound HTTPS to `api.openai.com` for Live Mode;
- serve the frontend and API from the same origin unless explicit CORS and CSRF controls are added.

Serverless static-only hosting is not sufficient because Live Mode requires a trusted server boundary. Adapting to a worker runtime is possible, but is a different deployment target and is not required for v0.1.

## Data behavior after deployment

v0.1 project data lives in browser `localStorage`, not in the container. This means:

- application redeploys do not normally delete a project on the same browser and origin;
- changing the public origin, clearing site data, private-browsing cleanup, or losing the device can delete local state;
- another browser or user cannot see the project;
- scaling the stateless server does not split project state;
- export is the required backup mechanism.

Use **Export Project Backup** before a consequential session or origin change and **Import Project Backup** to restore the versioned JSON. **Download Final Report**, **Download Report JSON**, and **Notebook JSON** are readable/audit artifacts; none acts as a restorable whole-project backup.

For public multi-user use, replace the device-local repository adapter with authenticated durable storage, encryption and retention controls, ownership/authorization checks, migration tooling, quotas, and deletion/export workflows. The reasoning runtime should continue to receive one explicit project state object; it should not query unrelated projects.

## Health, shutdown, and failure behavior

- `/api/health` reports process availability without revealing a key.
- `/api/status` reports whether Live Mode is configured, the selected model, persistence mode, and registered modules.
- The process handles `SIGTERM`/`SIGINT` with a graceful HTTP shutdown.
- Static and API responses include a restrictive content-security policy and baseline browser security headers.
- Invalid input, model schema errors, missing citations, required-search failure, API failure, and timeouts do not mutate project state.
- Demo Mode remains available during live-provider failures.

## Security boundary for v0.1

The container is appropriate for a controlled public demo, not open multi-tenant production. There is no login, authorization, per-user server storage, rate limiting, WAF policy, centralized audit log, abuse detection, or production telemetry. A public URL with a paid API key can incur usage from any visitor. Use host-level access control or a restricted/revocable key and budget limits for the judging window.

## Release check

```bash
npm run verify
```

Then verify Demo Mode in a fresh browser profile, validate export/import, check the browser console, and—when a funded key is available—run one bounded Live route and one public-research cycle.
