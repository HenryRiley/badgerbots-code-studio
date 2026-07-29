# Checkpoint 22 — Apache `/classroom/` internal prototype

## Genuinely working

- A production static export can serve the connected classroom at `/classroom/` and the Blockly
  editor at `/classroom/editor/`, including correctly prefixed assets and trailing-slash routes.
- The packaged artifact contains only the classroom entry page, versioned Web assets, an Apache
  configuration, and a checksum manifest.
- The manual GitHub workflow deploys through host-key-verified SFTP to a destination ending exactly
  in `/classroom`. It uploads assets first and swaps `index.html` last without deleting the parent
  site.
- Connect passes its stable device ID through a URL fragment. Classroom accepts only a canonical
  UUID and removes the fragment immediately.
- The Supabase production workflow sets the explicit `https://henrydriley.com` browser origin
  before redeploying the API.

## Automated evidence

- Web unit tests: 7 passed, including invalid/query-string device handoff cases.
- Web TypeScript check passed.
- Connect native tests: 4 passed.
- Next.js 16.2.11 optimized static export compiled and generated all routes.
- Apache package validation found working dashboard/editor links and produced 37 files totaling
  2,340,114 bytes with SHA-256 entries.
- Deployment shell syntax and repository diff checks passed.

## Configuration

- Repository variables: `BADGERBOTS_WEB_URL`, `BADGERBOTS_WEB_ORIGIN`,
  `BADGERBOTS_SUPABASE_URL`, and `BADGERBOTS_SUPABASE_PUBLISHABLE_KEY`.
- The `classroom-prototype` GitHub Environment holds six SFTP secrets. No SFTP credential or
  Supabase privileged key is embedded in the Web artifact.
- Full setup and verification are in `docs/apache-classroom-deployment.md`.

## Security/privacy and limitations

- This is internal prototype hosting and is restricted to synthetic camper data. The existing site
  and classroom app share one browser-origin security boundary.
- SFTP deployment and the public HTTPS smoke test require the owner's server path and GitHub
  Environment secrets, so they have not been run from the development Mac.
- The artifact uses the public Supabase URL and publishable key as intended. Service-role and SFTP
  credentials remain server-side.
- Production camp use still requires a dedicated classroom origin, privacy review, signed desktop
  installers, and physical multi-client Windows evidence.
