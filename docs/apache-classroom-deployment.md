# Apache `/classroom/` internal prototype deployment

This deployment publishes the static BadgerBots classroom Web app at
`https://henrydriley.com/classroom/`. It does not replace or modify the existing homepage.

## What “Apache document root” means

The document root is the SFTP folder that contains the files for `https://henrydriley.com/`.
In an SFTP application, find the existing homepage file, usually `index.html`, `index.php`, or
`index.shtml`. The folder containing that file is the document root.

- If SFTP opens directly beside the homepage file, use `/classroom`.
- If the homepage is in a folder named `public_html`, use `/public_html/classroom`.
- If it is in `htdocs`, use `/htdocs/classroom`.

Do not guess a server operating-system path such as `/var/www/...`. The GitHub workflow needs the
path visible to the restricted SFTP account. Do not send SFTP passwords or private keys through
chat.

## Prototype privacy boundary

`henrydriley.com` and `/classroom/` share one browser storage and script security boundary. This is
acceptable for an internal prototype using test camper names only. Do not use real child data until
the classroom app has a dedicated origin such as `classroom.badgerbots.org` and the privacy review
is complete.

The Connect app puts its device identifier in a URL fragment (`#bbDevice=...`) rather than the
query string. The Web app reads and removes it immediately, so normal Apache access logs do not
record it.

## One-time GitHub setup

Create a GitHub Environment named `classroom-prototype`. Require approval for deployment if another
owner is available.

Set these repository variables:

| Variable                              | Value                               |
| ------------------------------------- | ----------------------------------- |
| `BADGERBOTS_WEB_URL`                  | `https://henrydriley.com/classroom` |
| `BADGERBOTS_WEB_ORIGIN`               | `https://henrydriley.com`           |
| `BADGERBOTS_SUPABASE_URL`             | Supabase Project URL                |
| `BADGERBOTS_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key            |

Set these secrets on the `classroom-prototype` Environment:

| Secret                      | Meaning                                          |
| --------------------------- | ------------------------------------------------ |
| `SFTP_HOST`                 | SFTP server hostname                             |
| `SFTP_PORT`                 | Usually `22`                                     |
| `SFTP_USERNAME`             | Prefer a dedicated deployment account            |
| `SFTP_PRIVATE_KEY`          | Private key for that account                     |
| `SFTP_HOST_KEY`             | The verified `known_hosts` line for the server   |
| `SFTP_REMOTE_CLASSROOM_DIR` | SFTP-visible path ending exactly in `/classroom` |

The SFTP account should be restricted to the website directory. The workflow rejects a destination
that does not end in `/classroom`, does not delete the parent website, uploads versioned assets
first, and replaces `index.html` last.

## Publish

1. Merge the reviewed pull request after CI passes.
2. Run **Deploy Supabase production** from GitHub Actions and enter `deploy`. This authorizes
   `https://henrydriley.com` as a classroom API browser origin.
3. Run **Deploy classroom Web to Apache** and enter `deploy-classroom`.
4. Open `https://henrydriley.com/classroom/` in a private browser window.

The Web deployment produces and retains a 14-day GitHub artifact before uploading. A failed upload
does not modify the main website. Old hashed `_next` assets are intentionally retained for safe
rollback; they can be cleaned later with a narrowly scoped maintenance operation.

## Manual acceptance check

1. Confirm the normal homepage still works.
2. Sign in to `/classroom/` with a test instructor.
3. Create a test session and join it in a private window using fake camper data.
4. Use **Block editor** and confirm `/classroom/editor/` loads the real Blockly workspace.
5. Open Code Studio from the current Connect build. Confirm the page loads and the address bar no
   longer contains `bbDevice`.
6. Save and Run a test program, refresh, and confirm the acknowledged version remains.
7. In browser developer tools, confirm classroom API requests succeed rather than returning a CORS
   error.
