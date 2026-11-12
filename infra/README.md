# Kineō server

Everything Kineō's apps talk to, running on the ZimaBoard (Ubuntu LTS, headless) next to the containers already there:

| Service   | Does                                                     | Listens on (local only) | Public through Caddy             |
| --------- | -------------------------------------------------------- | ----------------------- | -------------------------------- |
| Postgres  | The database (Supabase's image, with row-level security) | `127.0.0.1:55324`       | never                            |
| PostgREST | The REST API the apps read and write through             | `127.0.0.1:55321`       | `api.getkineo.work/rest/v1/*`    |
| Storage   | Logos and invoice PDFs                                   | `127.0.0.1:55322`       | `api.getkineo.work/storage/v1/*` |
| PowerSync | Offline sync to each practitioner's devices              | `127.0.0.1:55325`       | `sync.getkineo.work`             |
| Studio    | Admin dashboard (with postgres-meta)                     | `127.0.0.1:55323`       | never (SSH tunnel only)          |

Sign-in is Clerk: every request carries the user's Clerk token, and PostgREST, Storage and PowerSync each check it. Row-level security and PowerSync's sync streams both key on the Clerk user ID, so a practitioner only ever reaches their own data. Supabase Auth, its API gateway, Realtime and Edge Functions are not used.

It all runs as one Docker Compose project, `kineo`, so its containers, volumes and networks never mix with others on the machine.

## Files

| Path                             | What                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `docker-compose.yml`             | The stack, with pinned versions                                                              |
| `kineo.env.example`              | Every setting, explained. `setup.sh` copies it to `kineo.env`                                |
| `kineo.env`                      | Your settings and secrets. Git-ignored, `chmod 600`. **Back it up.**                         |
| `db/init/`                       | Runs once when the database is first created (role passwords, `auth.jwt()`, PowerSync roles) |
| `powersync/`                     | PowerSync config and the sync streams                                                        |
| `caddy/kineo.caddy`              | Site blocks for the host Caddy (`sites.d` drop-in)                                           |
| `setup.sh`                       | First-time setup and re-apply; safe to run any time                                          |
| `update.sh`                      | Pull the latest code and apply it                                                            |
| `status.sh`                      | Health check                                                                                 |
| `systemd/`                       | `kineo.service` (start on boot), nightly backup timer, and their installer                   |
| `backup/backup.sh`, `restore.sh` | Encrypted backups and restore                                                                |

Database changes live in `supabase/migrations/` at the repo root; `setup.sh` applies each one once. It starts the database and Storage first, because Storage creates its own tables (which the logo migration adds a bucket and access rules to), then applies migrations, then starts the rest.

## First-time setup

### 1. Before you start

- **Packages:** Docker with Compose v2 (already there), plus `sudo apt install age` for backups. `curl`, `openssl` and `python3` come with Ubuntu.
- **DNS:** `A` records (and `AAAA` if you use IPv6) for `api.getkineo.work` and `sync.getkineo.work` pointing at the home IP, and ports 80 and 443 reaching the ZimaBoard, as for your other sites. Direct, not through the Cloudflare tunnel.
- **Clerk** (dashboard):
  - Turn on the **Supabase integration** (Configure → Integrations → Supabase, or <https://clerk.com/setup/supabase>). It adds `role: "authenticated"` to session tokens, which PostgREST and Storage need. Note the **Frontend API domain** it shows (e.g. `clerk.getkineo.work` or `your-app.clerk.accounts.dev`).
  - Create a **JWT template** for PowerSync (Configure → JWT templates): set `aud` to the value you'll use for `POWERSYNC_JWT_AUDIENCE` (suggested `getkineo-sync`) and the lifetime to 60 minutes or less. The apps request this template when they connect to PowerSync.
- **Backup key**, on **your own computer**, not the server:

  ```bash
  age-keygen -o kineo-backup.key
  ```

  Keep `kineo-backup.key` safe (password manager or an offline drive): it's the only thing that can read the backups. You'll paste its public key (`age1…`) into the settings.

### 2. Install

```bash
git clone <repo URL> ~/kineo
cd ~/kineo
sudo infra/setup.sh
```

`setup.sh` asks for the five things only you know (API URL, sync URL, Clerk domain, PowerSync audience, and the data folder, which defaults to `/mnt/nvme/kineo` on the SSD; the URLs and audience have defaults too), generates every secret into `infra/kineo.env`, starts the database, applies the migrations, starts the rest, and (run with `sudo`) installs `kineo.service` so the stack starts on boot. It never prints a secret.

Then set up backups in `infra/kineo.env`:

```bash
sudo nano infra/kineo.env
#   BACKUP_AGE_RECIPIENT=age1…   (the public key from step 1)
#   BACKUP_DIR=/mnt/backup/kineo  (a different drive from the data, e.g. the external drive)
#   BACKUP_KEEP=14
sudo infra/systemd/install.sh     # turns the nightly backup timer on
sudo systemctl start kineo-backup # make one now
ls -l /mnt/backup/kineo
```

**Copy `infra/kineo.env` somewhere safe too** (password manager). Without it the existing database can't be reached, and `setup.sh` will refuse to make a new password over an existing database.

### 3. Caddy

Link the drop-in into the folder your main Caddyfile imports, check, and reload:

```bash
sudo ln -sf ~/kineo/infra/caddy/kineo.caddy /etc/caddy/sites.d/kineo.caddy
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

**Authelia:** nothing to change. Neither block imports `authelia`, on purpose: there's no web UI on these hosts, only APIs the apps call with Clerk tokens (an interactive login would break them). Only these paths are served; everything else is a 404:

- `api.getkineo.work`: `/rest/v1/*`, `/storage/v1/*`
- `sync.getkineo.work`: `/sync/*`, `/write-checkpoint*`

### 4. Check

```bash
sudo infra/status.sh --public
```

Every line should say `ok`, ending with `All good.` (the public checks expect the API to refuse an anonymous request with 401, and unlisted paths to be 404).

### Demo data (optional)

To try the apps with made-up data, load it for your own Clerk user ID:

```bash
sudo SEED_OWNER_ID=user_xxxxxxxx infra/setup.sh --seed
```

## Day to day

From the repo folder (`cd ~/kineo`). `kineo.env` is readable by root only, hence `sudo`.

| To                     | Run                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| Check health           | `sudo infra/status.sh` (add `--public` to check through Caddy)                                                  |
| See logs               | `sudo docker compose --env-file infra/kineo.env -f infra/docker-compose.yml -p kineo logs --tail 100 <service>` |
| Update                 | `sudo infra/update.sh` (pulls, applies migrations, restarts what changed, reports status)                       |
| Restart everything     | `sudo systemctl restart kineo`                                                                                  |
| Back up now            | `sudo systemctl start kineo-backup`                                                                             |
| Next scheduled backup  | `systemctl list-timers kineo-backup`                                                                            |
| Open Studio            | From your computer: `ssh -L 55323:127.0.0.1:55323 <server>`, then <http://localhost:55323>                      |
| Clerk rotated its keys | `sudo infra/setup.sh` (rebuilds the key set; PostgREST and Storage restart briefly)                             |

Containers restart on their own if they crash; `kineo.service` brings the whole stack back after a reboot. Stopping it (`systemctl stop kineo`) never deletes data.

If `update.sh` says the Caddy snippet or a systemd unit changed, follow its instructions (reload Caddy, or rerun `sudo infra/systemd/install.sh`).

## Backups and restore

Each night `kineo-backup.timer` writes `BACKUP_DIR/kineo-<UTC time>/` with three files, each encrypted to your public key with `age`:

- `database.dump.age`: Kineō's tables, data, row-level security policies and grants
- `storage.dump.age`: Storage's bucket and file records
- `files.tar.age`: the uploaded files

Nothing unencrypted is written to disk, and the server can't read its own backups. The newest `BACKUP_KEEP` are kept. Not included: PowerSync's working database (it rebuilds itself) and `kineo.env` (keep your own copy).

To restore, onto this server or a new one where `setup.sh` has already run:

```bash
# Copy the private key over just for the restore, then remove it.
sudo infra/backup/restore.sh /mnt/backup/kineo/kineo-20261112T031500Z ~/kineo-backup.key
shred -u ~/kineo-backup.key
sudo infra/status.sh
```

`restore.sh` first checks the key and reads every part all the way through; if anything is damaged it stops with nothing changed. The database is then restored in a single transaction (all or nothing), the files are replaced, and the API, Storage and PowerSync are restarted. On a new server, restore your saved `kineo.env` into `infra/` before running `setup.sh`, so the passwords match. Test a restore now and then (a spare machine works) so you know the key and backups are good.

## Where the data lives

Everything Kineō stores is in `KINEO_DATA_DIR` (on this server `/mnt/nvme/kineo`, on the SSD):

| Folder       | Holds                                                         |
| ------------ | ------------------------------------------------------------- |
| `db/`        | The Postgres database, including PowerSync's working database |
| `db-config/` | A small Postgres config folder                                |
| `storage/`   | Uploaded logos and invoice PDFs                               |

The folder is `drwx------` (root only). `setup.sh` refuses to create it on the system disk, which would mean the SSD isn't mounted, and `kineo.service` waits for the SSD to be mounted before starting. If the SSD is ever missing, the database refuses to start rather than starting empty on the wrong disk. Keep backups on a different drive (`BACKUP_DIR`), so they survive the SSD failing. Never copy the `db/` folder while the stack is running; use `backup.sh`.

## What's never exposed

- Postgres (`55324`) and Studio (`55323`) are bound to `127.0.0.1` and not in the Caddy snippet. Reach them over SSH or Tailscale only.
- PowerSync's health probes and admin API, and PostgREST's API description, return 404 publicly.
- `SERVICE_ROLE_KEY` bypasses row-level security. It stays in `kineo.env` on this server and is never put in an app; the apps only ever use the user's Clerk token.
- The Caddy access log (in Caddy's journal: `sudo journalctl -u caddy | grep getkineo.work`) never records `Authorization` headers, API keys or cookies.

## Troubleshooting

| Symptom                                                | Likely cause and fix                                                                                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setup.sh`: port already used                          | Something else on the machine uses that port. Pick a free one for that `KINEO_*_PORT` in `kineo.env`, and match it in `caddy/kineo.caddy`.                 |
| `setup.sh`: database exists but no `POSTGRES_PASSWORD` | `kineo.env` was lost or replaced. Restore your saved copy. (Only to wipe everything: `docker volume rm kineo_db-data`.)                                    |
| `setup.sh`: data folder would be on the system disk    | The SSD isn't mounted (`findmnt /mnt/nvme`). Mount it and run again. To deliberately use the system disk: `sudo KINEO_ALLOW_SYSTEM_DISK=1 infra/setup.sh`. |
| Database container won't start after a reboot          | The data folder is missing: the SSD didn't mount. Fix the mount, then `sudo systemctl restart kineo`.                                                      |
| `setup.sh`: couldn't fetch Clerk's keys                | Check `CLERK_DOMAIN` (no `https://`) and the server's internet access.                                                                                     |
| Apps get 401 from the API                              | The Clerk Supabase integration is off (no `role` claim), or Clerk rotated keys: run `sudo infra/setup.sh`.                                                 |
| Apps can't sync (PowerSync 401)                        | The PowerSync JWT template's `aud` doesn't match `POWERSYNC_JWT_AUDIENCE`, or its lifetime is over 60 minutes.                                             |
| `migration … changed after it was applied`             | An applied migration file was edited. Put changes in a new migration instead.                                                                              |
| Backup failed                                          | `journalctl -u kineo-backup`. Usually `age` not installed, `BACKUP_DIR` not mounted or writable, or `BACKUP_AGE_RECIPIENT` not set.                        |
