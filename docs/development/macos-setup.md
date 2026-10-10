# OrenjiTrade on a Mac, from zero

The goal: a new Apple Silicon Mac (M-series, macOS 27 "Golden Gate"; the owner's is a Mac mini with an Apple M6) that (a) runs Claude Code on your Max plan with bypass permissions and Ultracode, and (b) compiles, runs and tests the whole OrenjiTrade monorepo, locally and for free (no EAS, no cloud).

To continue the work on the Mac after setup, start Claude in the repo and ask it to read [claude-handoff.md](claude-handoff.md).

Researched 2026-10-09 by reading the repo (main @ 7420905 and the regions worktree `feature/regions-s2-wishlist` @ d76f8a4) and the official docs, then reviewed against the Homebrew, Docker Hub and Node APIs and the Claude Code, Expo, Apple, Docker and Maestro docs. Nothing was installed or run on a Mac at that time; the first run on the owner's Mac followed on 2026-10-10 (next section). Tags used below:
- **[repo]** read in the repo. Line numbers are `main` unless labelled "regions".
- **[docs]** from the tool's official page or API.
- **[memory]** standard command, not re-checked on an official page.
- **(unverified)** not confirmed. Check it on the Mac.
- **[proven 2026-10-10]** run on the owner's Mac that day.
- **Intel Mac:** marks the only places where an Intel Mac differs.

### First run on the owner's Mac (2026-10-10)

Mac mini, Apple M6 (12 cores), 24 GB RAM, macOS 27.0.1. What it has:

| Tool | Installed |
|---|---|
| Docker | **OrbStack 2.2.3** (Docker Engine 29.4.0, Compose v5.1.2), not Docker Desktop: section 4.4 |
| Java | Temurin 27 is the only system JDK and `JAVA_HOME` is unset. Gradle provisioned Temurin 21.0.12 under `~/.gradle/jdks`: section 5 |
| Node | 24.21.0 with npm 11.19.0 (nvm) |
| Xcode | 27.0 with iOS 27 simulators |
| Maestro | 2.11.0 in `~/.maestro/bin` |
| Terraform | 1.16.5 (Homebrew) |
| Playwright | Chromium in `~/Library/Caches/ms-playwright` |

Not installed yet:
- **The Android SDK** (no adb, no emulator, no AVD). `npm run test:mobile:maestro` cannot run until 9.3 is done.
- Python 3.12 (ML is on hold; the system `python3` is 3.9.6), watchman, gcloud.
- git `user.name` and `user.email` are not set (3.1): a commit made by hand gets `<user>@<host>.local` as its author.
- macOS Rosetta 2 (`arch -x86_64 /usr/bin/true` fails). The containers do not need it under OrbStack (4.4).

Proven that day:
- `npm run dev` runs on OrbStack (the owner's stack was up: three healthy containers and the API) once `docker-compose.yml` names `platform: linux/amd64` for PostGIS (committed that day).
- Testcontainers works under OrbStack with no extra setting: `FlywayMigrationIT` and `FeatureFlagsIT` (12 tests) passed twice, 16 s and 19 s for the whole Gradle run. The emulated PostGIS container started in 3.5 s, 44 migrations took 0.6 s, the Spring context 10 s.
- Gradle works with Temurin 27 as the only system JDK: the daemon runs on Java 21 and `spotlessCheck` passes (section 5).
- The API image's build stage builds (`docker build --target build apps/api`, 3 min).
- `npm run test:scripts` passes (111 tests).

Not run that day: the full `npm run test:api`, the web and mobile E2E suites, the Maestro suite (no Android SDK) and anything on the iOS simulator.

---

## Before you switch (on the Windows PC)

Run these in **Git Bash** on Windows, not PowerShell 5.1: PowerShell's `>` rewrites binary output as UTF-16 and corrupts a database dump. Docker Desktop must be running for step 3.

- [x] **1. Commit and push every branch you need.** Done on 2026-10-09: every worktree was clean and pushed. S1 is merged into `main` (#57), `feature/regions-s2-wishlist` (stage S2, re-review pending) and the backup branch `backup/expo-sdk-58-deps` are on GitHub, and `feature/expo-sdk-58` is draft PR #54. The current state and the next steps are in [claude-handoff.md](claude-handoff.md).

- [ ] **2. Never copy the Windows working tree to the Mac.** Why: the Windows clone has `core.autocrlf=true`, and CRLF line endings break `infrastructure/docker/firebase-emulator/entrypoint.sh` and `apps/api/gradlew`. The Mac always does a fresh `gh repo clone` (3.3). Verify later, on the Mac: `git ls-files --eol apps/api/gradlew infrastructure/docker/firebase-emulator/entrypoint.sh` shows `w/lf` for both.

- [ ] **3. Optional: move the dev database and the card cache together.** Why: the card metadata and the `card_image` rows live in the Postgres Docker volume, not in the git-ignored folders. Copying only `apps/api/.local-storage` (card images, 695 MB) and `apps/api/.local-dev` (YGOPRODeck snapshots, 72 MB) gives orphan files on a fresh Mac DB [repo]. Skip this step and re-import on the Mac instead (10.2, option a) if you prefer.
  ```bash
  cd /c/dev/OrenjiTrade
  docker exec orenjitrade-postgres psql -U orenjitrade -d orenjitrade -tAc "select version from flyway_schema_history order by installed_rank desc limit 1"   # 105 = main, 112 = regions: restore on that branch
  docker exec orenjitrade-postgres pg_dump -U orenjitrade -Fc orenjitrade > orenjitrade.dump
  tar -czf orenji-local-data.tgz -C apps/api .local-storage .local-dev
  ```
  Verify: `head -c 5 orenjitrade.dump` prints `PGDMP`, and `tar -tzf orenji-local-data.tgz | head -3` lists both folders. Copy the two files to the Mac (USB drive or a cloud folder). The restore is in 7.5.

- [ ] **4. Optional: copy your Claude Code memory.** The project decisions and working agreements it holds are now also written down in [claude-handoff.md](claude-handoff.md), which a Mac session reads from the repo, so this step is only a convenience. It is 10 `.md` files [repo].
  ```bash
  tar -czf ~/Desktop/claude-memory.tgz -C ~/.claude/projects/C--dev-OrenjiTrade memory
  ```
  Verify: `tar -tzf ~/Desktop/claude-memory.tgz | grep -c '\.md$'` prints `10`. Do **not** copy `~/.claude/.credentials.json`; the Mac logs in through the Keychain (2.3). Section 3.5 says where the memory goes.

---

## 0. Prerequisites: hardware, disk and time

### 0.1 Hardware and OS

| Need | Minimum | Comfortable | Why |
|---|---|---|---|
| macOS | macOS 27 Golden Gate (shipping on new Macs), or Tahoe 26.6+ for the App Store Xcode 27 | latest 27.x | Expo SDK 57 needs Xcode 26.4+. The App Store serves Xcode 27, which needs Tahoe 26.6+. Xcode 26.4-26.6 run on Tahoe 26.2+ and come from developer.apple.com/download [docs] |
| RAM | 16 GB | 32 GB+ | Docker (6-8 GB), the Gradle daemon (`-Xmx2g`) plus test JVMs, `ng serve`, Metro, an Android emulator, the iOS simulator, and up to 16 workflow agents |
| Free disk | ~110 GB | 150 GB+ free | Xcode plus a simulator runtime ~40 GB, Android ~20-25 GB, Docker ~10-20 GB, repo and caches ~10-15 GB (estimates) |

### 0.2 Time

About 3-4 h wall-clock (1.5-2 h hands-on), plus about 1 h if you run the full Maestro suite. Xcode alone takes 45-90 min, and the first `npm run dev` 5-10 min (estimates).

### 0.3 Where Intel Macs differ

- Intel Macs stop at macOS Tahoe 26.x (no macOS 27). Use Tahoe 26.6+ for Xcode 27, or Xcode 26.4-26.6 on 26.2+. Apple's page does not say whether Xcode 27 supports Intel (unverified).
- Homebrew lives in `/usr/local`, not `/opt/homebrew`.
- No Rosetta is needed, and PostGIS runs natively (faster).
- Android needs x86_64 system images, not arm64-v8a.
- Docker Desktop has a separate Intel DMG.

---

## 1. macOS basics

### 1.1 Update macOS
Why: a new Mac ships with macOS 27; the App Store Xcode 27 (needed for Expo SDK 57 on the iOS simulator) needs at least Tahoe 26.6.

Do: System Settings > General > Software Update.

Verify:
```bash
sw_vers -productVersion   # 27.x on a new Mac (26.6+ minimum for Xcode 27)
uname -m                  # arm64 on Apple Silicon, x86_64 on Intel
```

### 1.2 Xcode Command Line Tools
Why: they provide git, clang, `xcrun`, and the headers Homebrew and Maestro need.
```bash
xcode-select --install
```
Verify:
```bash
xcode-select -p && git --version
```

### 1.3 Homebrew
Why: it installs almost every tool in this guide.
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```
Verify:
```bash
brew --version && brew doctor
```
Intel Mac: the path is `/usr/local/bin/brew`.

### 1.4 Rosetta 2 (Apple Silicon only)
Why: `postgis/postgis:17-3.5` exists only for linux/amd64 [docs: Docker Hub, 2026-10-09; `docker manifest inspect` shows one linux/amd64 image, proven 2026-10-10]. Every PostGIS container, in `npm run dev` and in Testcontainers, runs under x86 emulation, and Docker Desktop's Rosetta option needs Rosetta installed.
```bash
softwareupdate --install-rosetta --agree-to-license   # [memory]
```
Verify [memory]:
```bash
arch -x86_64 /usr/bin/true && echo "rosetta ok"
```
- On the owner's Mac this check fails ("Bad CPU type in executable"): macOS Rosetta 2 is not installed there. OrbStack runs amd64 containers through Rosetta for Linux all the same [proven 2026-10-10]; the check that matters for this repo is the container one in 4.4. Install Rosetta 2 as above if you use Docker Desktop, or if you need an Intel macOS program.

macOS 27 is the last release with full Rosetta. After that Docker falls back to QEMU, which still works but is much slower. Plan the arm64 PostGIS image decision (an owner/ADR item, see 12) before upgrading to macOS 28 (fall 2027).

### 1.5 zsh profile
zsh is the default shell. Each section below appends its own lines to `~/.zprofile` (fnm and the `orenji` alias go to `~/.zshrc`), so every step can be pasted on its own. After any append, run `source ~/.zprofile` (or `~/.zshrc`), or open a new terminal tab.

Verify:
```bash
echo $SHELL   # /bin/zsh
```

### 1.6 Keep the Mac awake during long runs
Why: Ultracode workflows, the ~50 min Maestro suite and `test:api` under emulated PostGIS run unattended, and sleep interrupts them.
```bash
caffeinate -dimsu npm run test:api      # wraps one command; or run `caffeinate -dimsu` alone in a spare tab, Ctrl+C when done
```
Or plug in and turn on "Prevent automatic sleeping when the display is off" (System Settings > Battery > Options, on power adapter).

Verify (while it runs):
```bash
pmset -g assertions | grep -i caffeinate
```

---

## 2. Claude Code with Max: bypass permissions and Ultracode

### 2.1 Claude Code CLI (recommended for Ultracode)
Why: the Ultracode controls (`/effort ultracode`, `--effort ultracode`) are documented for the terminal. The native installer auto-updates and needs no Node.

Requirements: macOS 13+, 4 GB+ RAM. Ripgrep is bundled.
```bash
curl -fsSL https://claude.ai/install.sh | bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zprofile && source ~/.zprofile
```
Verify:
```bash
claude --version    # 2.1.296 or newer as of 2026-10-09
claude doctor
which -a claude     # exactly one: ~/.local/bin/claude
```

Alternatives [docs]:
- `brew install --cask claude-code@latest`, or `claude-code` for the stable channel, about a week behind.
- Brew installs do not auto-update. Run `brew upgrade` yourself.
- Avoid npm installs. They need Node 22+, and you must never use `sudo npm`.

### 2.2 Claude desktop app (optional)
Why: it gives you the GUI Code tab. It bundles its own Claude Code and shares `~/.claude` (settings and sessions) with the CLI.
- Download the universal DMG from https://claude.com/download and drag it to Applications.
- Sign in with your Max account, open the **Code** tab, pick environment "Local", then "Select folder".
- No minimum macOS version is documented for the desktop app.
- Shortcuts: `Cmd+Shift+M` opens the permission modes, `Cmd+Shift+I` the model, `Cmd+Shift+E` the effort. `Shift+Tab` does not cycle modes in the desktop app.

Verify: the Code tab lists `~/dev/OrenjiTrade` after you select it (once section 3 is done).

### 2.3 Sign in with Max and confirm the plan
Why: if `ANTHROPIC_API_KEY` is set anywhere, Claude Code offers to use it. Approving silently bills the API instead of your Max plan.
```bash
grep -n ANTHROPIC_API_KEY ~/.zprofile ~/.zshrc 2>/dev/null   # must print nothing; delete any line it finds
unset ANTHROPIC_API_KEY
claude          # a browser opens (press c to copy the URL if it doesn't); choose your claude.ai Max account
```
Expected result: "Login successful". The login is stored in the macOS Keychain. Do not copy `.credentials.json` from Windows.

Verify inside Claude:
- `/status`: the Login method, Email and Organization rows show your claude.ai account. The exact "Max" label text is not in the docs.
- `/usage`: shows the plan usage bars.

### 2.4 Bypass permissions: the rules
- **For one session:** `claude --dangerously-skip-permissions`, or the equivalent `claude --permission-mode bypassPermissions`. The first interactive start shows a warning; accepting writes `"skipDangerousModePermissionPrompt": true` to `~/.claude/settings.json`.
- **As a default:** only the **user** settings file `~/.claude/settings.json` can set it (2.7). A `bypassPermissions` value in a project `.claude/settings.json` or `.claude/settings.local.json` is **ignored**, and those sessions start in Manual. The repo has no `.claude/` folder anyway.
- **Built-in default:** since v2.1.283 it is auto mode.
- **Desktop:** Settings > Claude Code > enable "Allow bypass permissions mode", then choose "Bypass permissions" in the mode menu next to send. The choice is remembered per folder. A global `defaultMode: bypassPermissions` (2.7) also applies to Desktop sessions once that toggle is on.
- Never run it with `sudo` or as root. Claude Code refuses: "--dangerously-skip-permissions cannot be used with root/sudo privileges".
- **What still applies in bypass:** deny rules, explicit ask rules, and the protection of `rm`/`rmdir` on critical paths. Allow rules do nothing in bypass.

### 2.5 Ultracode (dynamic multi-agent workflows)
Ultracode is a **setting**, not a permission mode or an effort level. With it on, Claude plans a background workflow script that orchestrates subagents for every substantive task. It is available on Max and needs a model that supports `xhigh`. Opus 5.5, the Max default, does.

| Scope | How |
|---|---|
| One task | Put `ultracode` in the typed prompt, e.g. `ultracode: audit every endpoint for missing auth checks`. `Option+W` dismisses the highlight. |
| This session | `/effort ultracode`; turn off with `/effort ultracode off`. Or open `/effort`, press Tab to flip Ultracode, then Enter. Since v2.1.284 this **keeps the current effort level**. |
| At launch | `claude --effort ultracode` (v2.1.203+). The only route that **also sets xhigh**. The `orenji` alias (2.6) uses it. |
| Always | `"ultracode": true` in `~/.claude/settings.json`. It keeps the effort level; add `"effortLevel": "xhigh"` for xhigh (2.7). `effortLevel` and `CLAUDE_CODE_EFFORT_LEVEL` do **not** accept `ultracode`. |

Related settings and behaviour:
- **Size:** set it in `/config` > "Dynamic workflow size", or with `/config workflowSizeGuideline=small|medium|large|unrestricted`. Max defaults to medium, under 10 agents.
- **Monitoring:** `/workflows`. Keys: `p` pause or resume, `x` stop, `s` save as a /command. The desktop app shows workflows in the Background tasks pane.
- **No approval prompts in bypass:** workflows start without one, and a run cannot ask you anything mid-run.
- **Limits:** 16 concurrent agents by default and 1,000 per run. A warning appears above 25 agents or 1.5M projected tokens.
- **Low RAM:** on a 16 GB Mac, add `export CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS=6` to `~/.zprofile` (v2.1.269+).
- **Kill switch:** `"disableWorkflows": true` or `CLAUDE_CODE_DISABLE_WORKFLOWS=1`.
- **Desktop app (unverified):** the docs don't confirm that the Code tab's effort menu shows the Ultracode toggle, or that the keyword works in its prompt box. Use the CLI if in doubt.

### 2.6 Recommended: bypass and Ultracode only in this repo
Why: a global `defaultMode: bypassPermissions` applies to every folder on the Mac, and to Desktop sessions once their toggle is on, which is broader than this repo and against the docs' isolated-environments guidance. An alias keeps the built-in default (auto) everywhere else and turns on bypass plus Ultracode at xhigh only when you deliberately start Claude in this repo.

**Step 1: the alias.**
```bash
echo "alias orenji='cd ~/dev/OrenjiTrade && claude --dangerously-skip-permissions --effort ultracode'" >> ~/.zshrc && source ~/.zshrc
```
Verify:
```bash
type orenji    # orenji is an alias for cd ~/dev/OrenjiTrade && claude --dangerously-skip-permissions --effort ultracode
```

**Step 2: user settings with deny rules.** Deny rules apply in every mode, bypass included. Create `~/.claude/settings.json` with this content, keeping any keys Claude Code has already written, such as `skipDangerousModePermissionPrompt`:
```json
{
  "permissions": {
    "deny": [
      "Bash(git push *--force*)",
      "Bash(git push * -f*)",
      "Bash(git push -f*)",
      "Bash(git push *+*)",
      "Bash(docker system prune*)",
      "Bash(docker volume rm*)",
      "Bash(docker compose down -v*)",
      "Bash(docker compose *--volumes*)",
      "Bash(npm run infra:reset*)",
      "Bash(npm run card-images:clear*)"
    ]
  },
  "workflowSizeGuideline": "medium",
  "autoContinueAtUsageLimit": true
}
```
- The patterns catch `git push --force`, `git push origin main --force`, `git push -f origin x`, `--force-with-lease` and `git push origin +branch`. `:*` and a trailing ` *` are equivalent [docs].
- `npm run infra:reset` deletes the DB volumes **and** `apps/api/.local-storage`, the 695 MB card cache; `card-images:clear` deletes the cached image files [repo]. Run those yourself, never through Claude.
- I left the Bash sandbox (`"sandbox": {"enabled": true, "allowUnsandboxedCommands": false}`) out on purpose. It restricts shell network and file writes, which will probably block `npm ci`, Gradle downloads and `docker` (unverified). If you turn it on later with `/sandbox`, `sandbox.excludedCommands` (e.g. `"docker compose *"`) exists for exceptions.

Verify:
```bash
python3 -m json.tool ~/.claude/settings.json >/dev/null && echo "valid JSON"
claude    # in any other folder: the status line shows the default (auto) mode, not bypass; /permissions lists the 10 deny rules
```
The `orenji` check (bypass, Ultracode on at xhigh) happens at the first start in the repo, 3.4.

**Safety.** The docs recommend bypass only for isolated environments (containers, VMs or dev containers without internet access) and warn that "bypassPermissions offers no protection against prompt injection or unintended actions". On this Mac Claude can reach Docker, your `gh` token (push rights to the private repo) and all your files. Deny rules are a speed bump, not a security boundary: the docs say Bash rules can be evaded (`sh -c`, absolute paths, or a script that runs the command for you). So keep Time Machine on, start bypass only through `orenji`, leave every other folder on auto mode (which, per the docs, does not guarantee safety either), and for real isolation use a dev container with the `ghcr.io/anthropics/devcontainer-features/claude-code:1.0` feature and a non-root user.

### 2.7 Alternative: always on, in every folder
Why: only if you want every terminal session, wherever it starts, in bypass with Ultracode at xhigh. The safety paragraph above applies to the whole Mac then.

Replace `~/.claude/settings.json` with this (again keeping keys Claude Code wrote itself):
```json
{
  "permissions": {
    "defaultMode": "bypassPermissions",
    "deny": [
      "Bash(git push *--force*)",
      "Bash(git push * -f*)",
      "Bash(git push -f*)",
      "Bash(git push *+*)",
      "Bash(docker system prune*)",
      "Bash(docker volume rm*)",
      "Bash(docker compose down -v*)",
      "Bash(docker compose *--volumes*)",
      "Bash(npm run infra:reset*)",
      "Bash(npm run card-images:clear*)"
    ]
  },
  "ultracode": true,
  "effortLevel": "xhigh",
  "workflowSizeGuideline": "medium",
  "autoContinueAtUsageLimit": true
}
```
- Without `"effortLevel": "xhigh"`, the `ultracode` setting runs at the default effort, not xhigh.

Verify:
```bash
claude    # any folder: the status line shows bypass; /effort shows Ultracode on at xhigh; /config shows Dynamic workflows on
```

### 2.8 Model and effort
- `/model` opens the picker. Enter saves it as the default; `s` uses it for this session only.
- `default` on Max is **Opus 5.5** (1M context). Keep it.
- Avoid any `/model` row labelled "Requires usage credits" (Fable may be, depending on plan and seat; `sonnet[1m]` on Sonnet 4.6 is). `sonnet` now resolves to Sonnet 5.5, which has a native 1M window.
- `/effort low|medium|high|xhigh|max|auto`. The `ultracode` setting and `/effort ultracode` keep the current effort; only `--effort ultracode` (the `orenji` alias) also sets xhigh.

Verify: `/model` shows Opus 5.5 selected; `/effort` shows the level you expect.

### 2.9 Usage
- `/usage` shows the session and weekly bars and a breakdown by subagent. `d`/`w` switch between 24 h and 7 days.
- Ultracode spends limits much faster, because every agent draws from the same plan.
- Hitting a limit shows "session limit" or "weekly limit". `autoContinueAtUsageLimit` resumes after the reset.
- `/usage-credits` turns on paid overflow with a monthly cap. Leave it off to stay within your budget.
- Max's numeric quotas are not published. Watch the bars.

---

## 3. git, GitHub CLI and cloning the private repo

### 3.1 git identity
Why: commits need an author. Leave `autocrlf` unset, because `.gitattributes` already forces LF.
```bash
git config --global user.name "Yun Ji Liao"
git config --global user.email "<your GitHub email>"
git config --global init.defaultBranch main
```
Verify:
```bash
git config --get core.autocrlf   # prints nothing (or "input")
```

### 3.2 GitHub CLI
Why: `yunjiPoly/OrenjiTrade` is private. `gh` handles the auth, and Claude uses it for PRs.
```bash
brew install gh
gh auth login          # GitHub.com > HTTPS > Login with a web browser
gh auth setup-git      # makes git use gh's credentials for https
```
Verify:
```bash
gh auth status
```
- SSH also works: `gh auth login` can generate and upload a key if you choose SSH. HTTPS through gh is simpler.

### 3.3 Clone under your home folder
Why: Docker Desktop shares `/Users` by default [docs], and `docker-compose.yml` bind-mounts `./infrastructure/docker/postgres/init`. GitHub's default branch is `master` (f13b686, two merge commits ahead of `main` with the same tree), so a clone lands on `master`; `main` is the working branch [repo].
```bash
mkdir -p ~/dev && cd ~/dev
gh repo clone yunjiPoly/OrenjiTrade     # [memory]
cd OrenjiTrade
git branch --show-current               # master
git switch main                         # creates local main tracking origin/main
```
Verify:
```bash
git branch -vv          # * main ... [origin/main]
git branch -r           # origin/main, origin/master, origin/feature/regions-geography, origin/feature/regions-s2-wishlist (once pushed)
git log -1 --oneline    # 7420905 or newer, not f13b686 (that is master)
ls -l apps/api/gradlew  # -rwxr-xr-x
git ls-files --eol apps/api/gradlew infrastructure/docker/firebase-emulator/entrypoint.sh   # i/lf ... w/lf
```

To work on the regions branch:
```bash
git switch feature/regions-s2-wishlist
```
Alternatively, keep `main` in this folder and add a worktree, as on Windows:
```bash
git worktree add ../OrenjiTrade-regions feature/regions-s2-wishlist
```
Section 7.8 covers the database when you switch.

### 3.4 First Claude start in the repo
Why: Claude asks once to trust the folder and once to accept the bypass warning; both need you at the keyboard.
```bash
orenji      # = cd ~/dev/OrenjiTrade && claude --dangerously-skip-permissions --effort ultracode
```
1. Folder-trust prompt: trust `~/dev/OrenjiTrade`.
2. Bypass warning: accept it (written once as `skipDangerousModePermissionPrompt`).

Verify inside Claude, then `/exit`:
- the status line shows bypass permissions;
- `/effort` shows Ultracode on at xhigh;
- `/permissions` lists the deny rules from 2.6;
- `/status` shows your Max account.

If you chose 2.7 instead of the alias, plain `claude` in the repo shows the same prompts.

### 3.5 Bring the project memory over (optional)
Why: carries the decisions recorded on Windows ("Before you switch", step 4). The project folder exists only after 3.4.
```bash
ls ~/.claude/projects                                   # e.g. -Users-<you>-dev-OrenjiTrade (name inferred from the Windows pattern, unverified)
P=~/.claude/projects/-Users-$(whoami)-dev-OrenjiTrade   # adjust to what ls printed
tar -xzf ~/Downloads/claude-memory.tgz -C "$P"          # wherever you copied it; creates $P/memory/
```
Verify:
```bash
ls "$P/memory" | wc -l     # 10
grep -nE 'D:\\|LOCALAPPDATA|maestro\.bat|python3|JDK 17|Start-Process' "$P"/memory/*.md
```
**Edit the Windows-only facts** the grep finds, so future sessions are not misled: `D:\SDK`, `%LOCALAPPDATA%`, `D:\maestro\bin\maestro.bat`, "`python` not python3", "JDK 17 local", and starting Docker with `Start-Process`.

---

## 4. Docker: Docker Desktop or OrbStack

Pick one engine. 4.1 and 4.2 describe Docker Desktop (researched, never run on the owner's Mac). 4.4 describes OrbStack, which the owner's Mac runs [proven 2026-10-10]. 4.3 (Colima) is a fallback.

### 4.1 Install and first launch
Why: PostGIS, Redis and the Firebase Auth emulator run in Docker (`npm run infra:up`), and so do the Testcontainers tests.

Licence: Docker Desktop is free for a small business (under 250 employees AND under US$10M revenue), so it is free for you.

1. Download the **Apple-silicon** `Docker.dmg` from docs.docker.com/desktop/setup/install/mac-install/ and drag it to Applications. Or: `brew install --cask docker-desktop` [docs] (4.94.0; the old cask token was `docker`; needs macOS 14+).
2. Start Docker.app. Accept the Docker Subscription Service Agreement, then choose **"Use recommended settings (requires password)"**. This also sets up `/var/run/docker.sock` and the CLI links.
3. Settings > General > **"Start Docker Desktop when you sign in": ON** (off by default). Otherwise every npm script stops with "Docker is not running (docker info failed)" [repo]; on Windows you started it by hand.
4. Wait for "Engine running".

Verify:
```bash
docker version && docker compose version     # Compose v2 is required (scripts/lib/util.mjs:582-585)
docker run --rm hello-world
docker run --rm --platform linux/amd64 alpine uname -m   # x86_64 -> amd64 emulation works
```

### 4.2 Settings for this repo
- **General**
  - Virtual Machine Manager: **Apple Virtualization framework**.
  - **"Use Rosetta for x86_64/amd64 emulation on Apple Silicon": off by default; turn it ON** [docs]. Without it, PostGIS runs under QEMU and is much slower.
  - File sharing implementation: VirtioFS.
- **Resources > Advanced**
  - CPUs: 4-6.
  - Memory: 6-8 GB on a 16-24 GB Mac, 8-12 GB on 32 GB+. The repo asks for at least 4 GB, and 6 GB+ when `test:api` and the dev stack run together.
  - Swap: 2 GB.
  - Disk limit: 64-100 GB.
- **Advanced**
  - **"Allow the default Docker socket to be used": ON** (the recommended settings in 4.1 turn it on). It creates `/var/run/docker.sock`, the most compatible path for Testcontainers.
  - Leave Ryuk enabled (the Testcontainers default). The repo has no `testcontainers.properties`.

Verify:
```bash
ls -l /var/run/docker.sock && docker info --format '{{.MemTotal}}'
```

### 4.3 Free alternative: Colima (only if you can't use Docker Desktop)
Why: it is MIT-licensed, but Testcontainers does not test it and it needs extra environment variables.
```bash
brew install colima docker docker-compose jq
colima start --cpu 6 --memory 8 --disk 100 --vm-type=vz --vz-rosetta --network-address
export DOCKER_HOST="unix://${HOME}/.colima/default/docker.sock"
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
export TESTCONTAINERS_HOST_OVERRIDE=$(colima ls -j | jq -r '.address')
```
- Also wire up `docker compose` (the `cliPluginsExtraDirs` entry in `~/.docker/config.json` [memory]).
- **OrbStack is not free** for commercial or freelance use [docs, 2026-10-09]. It works with this repo (4.4): check its current licence terms yourself before relying on it for OrenjiTrade as a business.

Verify:
```bash
docker compose version && docker run --rm hello-world
```

### 4.4 OrbStack (supported; what the owner's Mac runs)
Why: it is a lighter Docker engine for macOS, and the repo needs nothing special for it. Everything below is [proven 2026-10-10] on OrbStack 2.2.3 (Docker Engine 29.4.0, Compose v5.1.2).

**Licence first.** The caution in 4.3 stands: OrbStack's free use is limited. **Owner: read OrbStack's current licence and pricing terms on its website and decide whether your use of it for OrenjiTrade needs a paid licence.** This guide states no price on purpose, because the terms change. Docker Desktop (4.1) and Colima (4.3) are the alternatives.

How it fits the repo:
- **Docker context.** OrbStack adds the context `orbstack` and makes it current (`docker.set_context: true`). Every npm script only calls `docker`, so nothing changes.
- **Socket.** `/var/run/docker.sock` is a symlink to `~/.orbstack/run/docker.sock`. Testcontainers finds it without any environment variable ("Found Docker environment with local Unix socket (unix:///var/run/docker.sock)"), and Ryuk works.
- **Rosetta.** `orbctl config show` prints `rosetta: true` on the owner's Mac. amd64 containers then run through Rosetta for Linux: `/proc/cpuinfo` in such a container says `VirtualApple`.
- **Resources.** `cpu: 12` and `memory_mib: 12288` (12 GB of the Mac's 24 GB) on the owner's Mac. The repo asks for at least 4 GB, and 6 GB+ when `test:api` and the dev stack run together.
- **Compose.** `docker-compose.yml` names `platform: linux/amd64` for PostGIS. Without that line an Apple Silicon engine refuses the pull: "no matching manifest for linux/arm64/v8 in the manifest list entries". Testcontainers needs no such line: after the same refusal it pulls linux/amd64 by itself (it logs the refusal once as an error on the very first pull).

Verify:
```bash
docker context ls              # orbstack *   unix:///Users/<you>/.orbstack/run/docker.sock
ls -l /var/run/docker.sock     # -> /Users/<you>/.orbstack/run/docker.sock
orbctl status                  # Running
orbctl config show | grep -E '^(rosetta|cpu|memory_mib|app.start_at_login|docker.expose_ports_to_lan):'
docker compose version         # Compose v2 or newer is required
docker run --rm --platform linux/amd64 alpine sh -c 'uname -m; grep -m1 "model name" /proc/cpuinfo'
#   x86_64 and "VirtualApple": Rosetta. A QEMU model name means Rosetta is off (much slower).
```
- If `alpine` was only ever pulled by this check, the local `alpine:latest` is the amd64 image, and a later plain `docker run alpine` runs emulated with a platform warning. `docker pull alpine` fetches the native image; after that both are cached and a plain run is `aarch64` again [proven 2026-10-10].

Three settings to look at on the owner's Mac (`orbctl config set <key> <value>` changes one; not run here, so (unverified)):
- **`app.start_at_login: false`.** After a restart every npm script stops with "Docker is not running" until you open OrbStack or run `orbctl start`.
- **`docker.expose_ports_to_lan: true`, and the macOS firewall is off.** OrbStack listens on every network interface for the published ports (`lsof` shows `*:5432`, `*:6379`, `*:9099`), so the local PostgreSQL (default local password), Redis (no password) and the Auth emulator are probably reachable from other devices on the same network. The data is fictional seed data, but on a shared network turn this setting off or turn the firewall on. A physical phone (9.6) needs the Auth emulator on the LAN, so decide with that in mind. **Owner decision.**
- **Never run `orbctl reset`** (or `orb reset`): it deletes all Docker data, the database volumes included. If you use the deny rules of 2.6, add `"Bash(orbctl reset*)"` and `"Bash(orb reset*)"`.

---

## 5. Java 21

Since 2026-10-10 the repo no longer needs the machine's default JDK to be 21:
- **The Gradle daemon is pinned to Java 21** by `apps/api/gradle/gradle-daemon-jvm.properties` (Gradle's Daemon JVM criteria, written by `./gradlew updateDaemonJvm --jvm-version=21`). The default `java` only launches `./gradlew` (`gradleInvocation` in `scripts/lib/util.mjs` runs `sh ./gradlew`). Gradle then starts its daemon on a Java 21 it finds on the machine, any vendor, or downloads one through the foojay resolver into `~/.gradle/jdks` (Temurin 21, about 200 MB, once).
- **Why the pin:** Spotless runs google-java-format 1.30.0 inside the daemon (`apps/api/build.gradle.kts`, the `spotless` block). On a JDK 27 daemon it fails with `NoSuchFieldError ... EndPosTable endPositions` [proven 2026-10-10], and on a JDK 17 daemon it fails as well [repo]. The `languageVersion 21` toolchain only covers compilation, tests and `bootRun`.
- **[proven 2026-10-10]** with Temurin 27 as the only system JDK and `JAVA_HOME` unset: `./gradlew spotlessCheck --rerun-tasks` failed before the pin and passes with it. `./gradlew --version` prints `Launcher JVM: 27 (Eclipse Adoptium 27+35)` and `Daemon JVM: Compatible with Java 21, any vendor, nativeImageCapable=false (from gradle/gradle-daemon-jvm.properties)`, and the daemon process is `~/.gradle/jdks/eclipse_adoptium-21-aarch64-os_x.2/jdk-21.0.12.1+1/Contents/Home/bin/java`.
- **The E2E harnesses run the API jar on Java 21 too.** `findJava21()` (`scripts/lib/util.mjs`) takes `ORENJI_JAVA_HOME` when it is Java 21 or newer (exported, or set in `.env`). Otherwise it takes an exact Java 21 from `JAVA_HOME`, `java` on PATH, `/usr/libexec/java_home` or `~/.gradle/jdks`, in that order, and falls back to a newer Java only with a warning in the log. On the owner's Mac it picks the Temurin 21 that Gradle provisioned, with `JAVA_HOME` unset and with `JAVA_HOME` exported to the Temurin 27 [proven 2026-10-10].
- **A machine still needs some JDK.** On a fresh Mac `/usr/bin/java` is only a stub [repo], and `./gradlew`, Maestro (Java 17+), `sdkmanager` and openapi-generator (Java 11+) all need a real `java`.
- **Older branches:** a branch without `apps/api/gradle/gradle-daemon-jvm.properties` (anything that does not contain the 2026-10-10 macOS fixes yet, for example `feature/regions-s2-wishlist` that day) still needs `JAVA_HOME` set to a JDK 21 for `spotlessCheck` and `npm run test:api`.
- **After the pin reaches such a branch**, run `cd apps/api && ./gradlew spotlessCheck --rerun-tasks` once in every worktree that already ran Gradle on JDK 27. The pin alone is not enough there: Gradle reports `:spotlessJava UP-TO-DATE` and fails again with the stored `NoSuchFieldError` lint errors, and `npm run test:api` reruns only the tests. Each worktree keeps its own stored result, and a new worktree can receive the failed one from the machine-wide Gradle build cache (`:spotlessJava FROM-CACHE`) [proven 2026-10-10 in scratch copies with their own build cache].

**Recommended: install Temurin 21 and make it `JAVA_HOME`.** One JDK then serves everything, it is the Java of CI and of the production image, and Gradle downloads nothing:
```bash
brew install --cask temurin@21     # [docs]
echo 'export JAVA_HOME="$(/usr/libexec/java_home -v 21)"' >> ~/.zprofile && source ~/.zprofile
```
Verify:
```bash
/usr/libexec/java_home -v 21     # /Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home [memory]
java -version                    # openjdk version "21.0.x" ... Temurin
echo $JAVA_HOME
cd apps/api && ./gradlew --version   # Daemon JVM: Compatible with Java 21, any vendor ... (from gradle/gradle-daemon-jvm.properties)
```

**Keeping a newer default JDK instead** (the owner's Mac: Temurin 27, `JAVA_HOME` unset). That works [proven 2026-10-10]. Three things to know:
- Without a JDK 21 installed, `/usr/libexec/java_home -v 21` does not fail: it answers with the default JDK (Temurin 27 on the owner's Mac, even for `-v 28`). So it does not prove that a JDK 21 is installed, and the `JAVA_HOME` line above would export the newer JDK there. `/usr/libexec/java_home -F -v 21` fails when there is none.
- With `JAVA_HOME` exported to a JDK newer than 21, the E2E harnesses still run the API jar on a Java 21 when the machine has one (here the one under `~/.gradle/jdks`), and the log says "JAVA_HOME is Java 27, so it is not used". Only `ORENJI_JAVA_HOME` makes them use another Java. Without any Java 21 they run the jar on the newer JDK and warn about it.
- Gradle keeps using Java 21 for the build whatever `JAVA_HOME` says.

No global Gradle is needed. The wrapper downloads Gradle 9.7.1.

---

## 6. Node and npm

The repo wants [repo]:
- `.nvmrc` = `24`.
- `engines.node` `>=24`.
- `packageManager` `npm@11.19.0`.
- Angular 22 needs Node `^24.15.0` on the 24 line. The current 24 LTS is **24.21.0**, which ships npm 11.19.0 exactly [docs: nodejs.org/dist/index.json].

Use fnm, which reads `.nvmrc` (nvm works too):
```bash
brew install fnm
echo 'eval "$(fnm env --use-on-cd --shell zsh)"' >> ~/.zshrc && source ~/.zshrc
cd ~/dev/OrenjiTrade && fnm install && fnm use && fnm default 24
```
Verify:
```bash
node -v    # v24.21.0 (anything from v24.15.0 works)
npm -v     # 11.19.0 (bundled with Node 24.21.0; no global npm upgrade needed)
```

---

## 7. First run of the repo

All commands run from `~/dev/OrenjiTrade`. Every script is a plain Node script under `scripts/` and needs no other tools.

### 7.1 Install dependencies
Why: one npm workspace covers web, mobile and the packages. The lockfile already contains the darwin-arm64 native packages [repo].
```bash
npm ci
```
- Run it **once, at the root only**. Never run `npm install` inside an app folder (apps/mobile/README.md:149).

Verify:
```bash
ls node_modules/.bin/ng node_modules/.bin/expo
```

### 7.2 Design tokens
Why: the web pre-scripts build them anyway, but running it once confirms the workspace works.
```bash
npm run build:tokens
```
Verify: the command exits 0 (`echo $?` prints `0`).

### 7.3 .env (optional)
Why: every default already matches `docker-compose.yml`. A `.env` is only for overrides. Shell variables override `.env`.
```bash
cp .env.example .env
```
Key local values:
- `DATABASE_URL=jdbc:postgresql://localhost:5432/orenjitrade`, user `orenjitrade`
- `REDIS_URL=redis://localhost:6379`
- `FIREBASE_AUTH_EMULATOR_HOST=localhost:9099`, `FIREBASE_PROJECT_ID=orenjitrade-local`
- `STORAGE_PROVIDER=local`, `CARD_IMAGE_LOCAL_CACHE_MAX_MB=5120`
- Payments, billing and donations use `fake`.
- `ORENJI_JAVA_HOME` (optional): the JDK for the E2E jar, normally a JDK 21. It wins over `JAVA_HOME` and the automatic choice (5). It works from `.env` or exported in the shell; the exported value wins.
- **Regions branch:** `GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_MAP_ID`, `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` and `LOCATION_JITTER_SECRET` are removed.

Verify: `diff <(grep -o '^[A-Z_]*=' .env.example) <(grep -o '^[A-Z_]*=' .env)` prints nothing.

### 7.4 Start the infrastructure
Why: this starts PostGIS (amd64, emulated), Redis and the Firebase Auth emulator. The emulator image is built locally from `node:22-alpine` with firebase-tools 14.27.0 and downloads the Emulator UI, so **the first run needs internet**.
```bash
npm run infra:up      # docker compose up -d --build --wait --wait-timeout 300
```
Verify:
```bash
docker ps --format '{{.Names}}\t{{.Status}}'   # orenjitrade-postgres, redis, firebase-auth: healthy
```
- `docker-compose.yml` names `platform: linux/amd64` for PostGIS (since 2026-10-10), so the pull works on Apple Silicon and Compose prints no platform warning. A plain `docker run postgis/postgis:17-3.5` still warns (`linux/amd64` on `arm64`) or, when the image is not cached, fails with "no matching manifest for linux/arm64/v8": add `--platform linux/amd64`.
- "Docker is not running" means Docker Desktop (4.1) or OrbStack (4.4) isn't started.
- Firebase emulator UI: http://localhost:4000

### 7.5 Optional: restore the Windows database and card cache
Why: brings the full catalogue and the cached images over without a re-import ("Before you switch", step 3). Do it after `infra:up` and before the first API start, on the branch whose migration level you noted (105 = main, 112 = regions).
```bash
git switch main          # or feature/regions-s2-wishlist if Windows showed 112
npm run infra:up
docker exec -i orenjitrade-postgres pg_restore -U orenjitrade -d orenjitrade --clean --if-exists < ~/Downloads/orenjitrade.dump
tar -xzf ~/Downloads/orenji-local-data.tgz -C apps/api       # restores .local-storage and .local-dev
npm run api:dev                    # terminal 1: the card-images commands need a running API
npm run card-images:reconcile      # terminal 2: re-syncs files, rows and byte accounting
npm run card-images:status
```
Verify:
```bash
docker exec orenjitrade-postgres psql -U orenjitrade -d orenjitrade -tAc "select version from flyway_schema_history order by installed_rank desc limit 1"   # same as on Windows
du -sh apps/api/.local-storage    # ~695M
```
- If `pg_restore` reports a few ignored errors (for example on extensions), trust the verify query rather than the exit code (unverified).

### 7.6 Run the app
Why: this is the daily dev loop (infra, API and web together).
```bash
npm run dev           # infra + API (gradlew bootRun, profile local, :8080) + web (ng serve, :4200)
```
- The first run downloads Gradle 9.7.1 and the Maven dependencies, then compiles. Expect 5-10 min. Later starts take about 1 min.
- **macOS firewall (only if it is on):** click Allow on the "java" and "node" incoming-connection prompts the first time the API, `ng serve` or Metro start. Check with `/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate` [memory].
- Open http://localhost:4200. Swagger UI is at http://localhost:8080/swagger-ui.html (local profile).
- Sign in with a seed account:
  - Accounts: `collector1`…`collector8`, `premium`, `moderator`, `admin` and `superadmin`, all `@orenjitrade.test`.
  - Password: the fictional seed password in `docs/development/test-accounts.md`, the same as `SEED_EMULATOR_PASSWORD` in `.env.example`.
  - `SeedDataRunner` reseeds them on every local-profile start.
  - **First sign-in per account shows an 18+ "Age" onboarding step**, once, on web and mobile. The seeds predate the 18+ rule and have no `AGE_CONFIRMATION` consent (`docs/development/test-accounts.md:31-36`) [repo]. Expected, not a bug.
  - **Regions branch:** each account has a declared place across americas-north, americas-south and europe (e.g. collector1 Montréal QC, collector3 Buenos Aires). On main they are in Montréal-area neighbourhoods.
- Run parts separately with `npm run api:dev` or `npm run web:dev`. Stop with Ctrl+C, then `npm run infra:down`.

Verify:
```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4200    # 200
lsof -nP -iTCP:8080 -sTCP:LISTEN                                   # java listening
```

### 7.7 Ports used

| Port | Service |
|---|---|
| 4000 | Firebase emulator UI |
| 4200 | Web dev server |
| 4300 | Web E2E |
| 5432 | PostgreSQL |
| 6379 | Redis |
| 8000 | ML service |
| 8080 | API |
| 8081 | Metro |
| 8082 | Maestro Metro |
| 8085 | Pub/Sub emulator (optional) |
| 8090 | Mobile E2E API |
| 8180 | Web E2E API |
| 9099 | Firebase Auth emulator |
| 19006 | Mobile-web E2E |

Make sure no Homebrew `postgresql` or `redis` service holds 5432 or 6379.

Verify:
```bash
lsof -nP -iTCP:5432 -iTCP:6379 -sTCP:LISTEN    # no postgres or redis-server process (Docker's own listener is fine)
```

### 7.8 Switching between main and regions
- Regions adds Flyway V106-V112, and main ends at V105 [repo].
- A database migrated by regions makes main's API fail Flyway validation.
- When you go back to main, run `npm run infra:reset` yourself (it is in the deny list, and it asks for confirmation; `-- --yes` skips it). **This deletes the DB volumes and the card cache in `apps/api/.local-storage`** [repo]. Re-import afterwards (10.2) if you need the catalogue.

Verify:
```bash
docker exec orenjitrade-postgres psql -U orenjitrade -d orenjitrade -tAc "select version from flyway_schema_history order by installed_rank desc limit 1"   # 105 on main, 112 on regions
```

---

## 8. Tests

Run all of these from the repo root with Docker running. Wrap the long ones in `caffeinate -dimsu` (1.6).

| Command | What it does | Mac notes |
|---|---|---|
| `npm run test:scripts` | `node --test scripts/lib/*.test.mjs` | Pure Node. Run it first as a smoke test. |
| `npm run test:api` | `gradlew check`, re-run every time: Spotless + unit + Testcontainers (`postgis/postgis:17-3.5`, `redis:7-alpine`, Ryuk) | Needs `/var/run/docker.sock` (Docker Desktop or OrbStack) and any JDK to launch Gradle: the daemon is pinned to Java 21 (5). PostGIS is emulated, so expect it to be slower than about 5 min / 704 tests on Windows. It runs `gradlew test --rerun catalogTest --rerun check` (scripts/test.mjs), so the containers start twice. A slice of two integration test classes took 16-19 s under OrbStack [proven 2026-10-10]; the full suite was not timed that day. On a Mac that never pulled PostGIS, the first run logs one "no matching manifest for linux/arm64/v8" error before Testcontainers pulls linux/amd64 by itself. |
| `npm run test:web` | Angular Vitest + lint | No extra steps. |
| `npm run test:e2e` | Isolated stack: API jar on :8180 (DB `orenjitrade_e2e`), web on :4300, Playwright Chromium | Installs Chromium itself (`playwright install chromium` in `runWebE2e`, `scripts/lib/web-e2e.mjs`). It never touches your dev DB or cache. |
| `npm run test:mobile` | Typecheck (typed routes + `tsc`) + `expo lint` + Jest (jest-expo 57) + the harness guard tests (`node --test`) | No device needed. |
| `npm run test:mobile:e2e` | Expo web export on :19006 + API on :8090 + Playwright | Section 9.5. |
| `npm run test:mobile:maestro` | Native Maestro flows on an Android emulator | Section 9.5. |
| `npm run test:all` | All of the above | |
| `npm run audit:gate` | `npm audit --json` vs `security/npm-audit-allowlist.json` | Needs network. **Fails on every machine after 2026-11-30**, when the node-forge and braces allowlist entries expire. |
| `npm run infra:validate` | `terraform fmt -check` + `init -backend=false` + `validate` on 4 root modules. No plan or apply. | Needs Terraform (below). |
| `npm run lint` / `npm run typecheck` | Workspace lint and type checks | |

Verify the smoke test first:
```bash
npm run test:scripts && echo "scripts ok"
```

### Playwright browsers
Why: the harnesses install Chromium automatically. Pre-installing just avoids a wait.
```bash
npx playwright install chromium      # @playwright/test 1.63.0, shared by web and mobile
```
Verify:
```bash
ls ~/Library/Caches/ms-playwright
```
`docs/development/local-setup.md` names this path for macOS since 2026-10-10 (it used to give only the Linux one). `--with-deps` is only needed on Linux.

### Terraform (validate only, never apply)
Why: every `versions.tf` requires `>= 1.9`, and CI uses 1.16.x. **`brew install terraform` fails** ("No available formula"): homebrew-core removed the formula on 2026-04-13 [docs: formulae.brew.sh]. `scripts/infra-validate.mjs` suggests the tap below since 2026-10-10.
```bash
brew tap hashicorp/tap
brew install hashicorp/tap/terraform     # 1.16.5 [docs]
```
Verify:
```bash
terraform version          # 1.16.x, darwin_arm64
npm run infra:validate     # providers are cached in .local-dev/terraform-plugin-cache
```

---

## 9. Mobile on the Mac

The app is Expo SDK 57 (expo 57.0.x, react-native 0.86.3, react 19.2.3) and runs in **Expo Go only**: no EAS, no native build.

### 9.1 Watchman (optional)
Why: Expo SDK 57 no longer requires it, but React Native still recommends it for Metro file watching.
```bash
brew install watchman
```
Verify:
```bash
watchman --version
```

### 9.2 Xcode and the iOS simulator (new: only possible on a Mac)
Why: Expo SDK 57 needs **Xcode 26.4+** (iOS 16.4+) [docs]. CocoaPods is not needed, because Expo Go is prebuilt.

1. Open the App Store and **sign in with your Apple ID** (free), then install Xcode (27.x, needs macOS 26.6+). Alternative: download a specific Xcode (26.4-26.6, for Tahoe 26.2+) from developer.apple.com/download with the same Apple ID. Xcode 27 plus the iOS 27 runtime is about 15-20 GB of download.
2. Open Xcode once.
3. Then run:
   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer   # also sets Xcode > Settings > Locations > Command Line Tools [memory]
   sudo xcodebuild -license accept                                    # [memory]
   sudo xcodebuild -runFirstLaunch                                    # [memory]
   xcodebuild -downloadPlatform iOS                                   # or Xcode > Settings > Components > iOS > Get [memory]
   ```

Verify:
```bash
xcodebuild -version        # Xcode 27.x (or 26.4+)
xcrun simctl list runtimes # an iOS 27 (or 26.x) runtime is listed
```

Run on the iOS simulator:
```bash
npm run infra:up && npm run api:dev            # terminal 1
npm run ios -w apps/mobile                     # terminal 2 [repo] (= cd apps/mobile && npx expo start --ios; or `npx expo start`, then press i)
```
- Expo CLI installs the matching Expo Go on the simulator.
- The simulator app: Xcode 27 renamed it **DeviceHub** (`open -a DeviceHub`); on Xcode 26 it is `open -a Simulator` [docs]. If Expo CLI hangs waiting for a simulator, run `xcrun simctl list devices available`, then `xcrun simctl boot "iPhone 17"` (or another listed name).
- The app reaches the API at `localhost` (the default for iOS in `apps/mobile/src/config/env.ts` `devHostFor`), so no `.env` is needed [repo].
- **Unverified:** Expo Go SDK 57 on an iOS 27 runtime. The project has never run the iOS path, and no harness automates iOS. If Expo Go misbehaves, install an iOS 26.x runtime (Xcode > Settings > Components).
- A physical iPhone: 9.6.

### 9.3 Android Studio, SDK and an arm64 AVD
Why: the Maestro harness drives an **Android** emulator. Your Windows x86_64 AVDs do not carry over, and x86_64 images don't run on Apple Silicon.

1. Download Android Studio for **Mac with Apple chip**, run the Setup Wizard, and choose **Standard**.
2. Settings > Languages & Frameworks > Android SDK > SDK Tools: Android Emulator, Platform-Tools, **Command-line Tools (latest)**. SDK Platforms (Android 36) and Build-Tools are optional: Expo Go does no native build.
3. Add to your profile:
   ```bash
   cat >> ~/.zprofile <<'EOF'
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"
   EOF
   source ~/.zprofile
   ```
   Verify: `echo $ANDROID_HOME && sdkmanager --version` (sdkmanager and Maestro use `JAVA_HOME`, or the default `java` when it is unset).
4. Accept the licences **first**, then install an **arm64-v8a** image and create the AVD (package IDs and flags [memory]; check them with `sdkmanager --list`):
   ```bash
   yes | sdkmanager --licenses
   sdkmanager "platform-tools" "emulator" "system-images;android-35;google_apis;arm64-v8a"
   echo no | avdmanager create avd -n Pixel_6_API_35 -k "system-images;android-35;google_apis;arm64-v8a" -d pixel_6
   ```
   GUI alternative: accept the licences in the SDK Manager, then Device Manager > Create > Pixel 6 > a "Google APIs ARM 64 v8a" image, API 35 (or 34).
5. Start it and **wait until Android has finished booting**. `adb wait-for-device` alone returns before boot completes, so an immediate `test:mobile:maestro` or `expo start --android` races it:
   ```bash
   emulator -avd Pixel_6_API_35 -no-snapshot-save -no-boot-anim &
   adb wait-for-device shell 'while [ "$(getprop sys.boot_completed)" != 1 ]; do sleep 2; done'
   ```

Verify:
```bash
adb shell getprop sys.boot_completed                 # 1
adb version && emulator -list-avds && adb devices    # emulator-5554  device
```

Run by hand:
```bash
npm run android -w apps/mobile    # [repo] (= cd apps/mobile && npx expo start --android; or press a)
```
- The app reaches the host at `10.0.2.2`, the Android default.
- **Main only:** the Android Leaflet/OSM map needs internet inside the emulator. Regions uses no map tiles or keys.

### 9.4 Maestro
Why: it runs the native E2E flows in `apps/mobile/.maestro` (Android Expo Go, `appId host.exp.exponent`). Local CLI only: never Maestro Cloud, never `maestro login`.
```bash
curl -fsSL "https://get.maestro.mobile.dev" | bash     # installs to ~/.maestro/bin [docs]
echo 'export PATH="$PATH:$HOME/.maestro/bin"' >> ~/.zprofile && source ~/.zprofile
```
Verify:
```bash
maestro --version     # needs a java: JAVA_HOME, or the default JDK
```
- With Temurin 27 as the default JDK, `maestro --version` prints 2.11.0 after three JDK `WARNING` lines about final-field mutation [proven 2026-10-10]. Running flows on Java 27 was not tried; if Maestro misbehaves there, start it with `JAVA_HOME` set to a JDK 21.
Brew alternative [docs]: `brew tap mobile-dev-inc/tap && brew install mobile-dev-inc/tap/maestro`. If brew refuses the tap formula as untrusted, run `brew trust --formula mobile-dev-inc/tap/maestro` (in Maestro's macOS docs) and install again.

### 9.5 Environment the mobile harnesses need on macOS

| Harness | Needs |
|---|---|
| `npm run test:mobile` | Nothing extra: typecheck + expo lint + Jest + harness guard tests, no device. |
| `npm run test:mobile:e2e` | Docker running; a Java 21 for the API jar (found automatically, `ORENJI_JAVA_HOME` overrides: 5); ports 8090 and 19006 free. The harness runs `expo export --platform web`, then `expo serve` on :19006, the API jar on :8090 (DB `orenjitrade_mobile_e2e`, Redis db 1), then Playwright. |
| `npm run test:mobile:maestro` | See the list below. |

`test:mobile:maestro` needs:
- **The Android SDK in `~/Library/Android/sdk`** (Android Studio's default), which the harness finds by itself since 2026-10-10. Set `ANDROID_HOME` only when the SDK is somewhere else; `adb` on PATH is the last resort. "No Android device is ready" now says whether adb itself is missing or only the emulator. **The owner's Mac has no Android SDK yet (2026-10-10), so this suite cannot run there until 9.3 is done.**
- `maestro` on PATH or in `~/.maestro/bin` (both found automatically). Otherwise set `MAESTRO_BIN=$HOME/.maestro/bin/maestro`.
- A `java` for Maestro (17+), and a Java 21 for the API jar, which the harness picks by itself (5).
- **Docker running:** the harness starts or reuses the isolated API on :8090 (DB `orenjitrade_mobile_e2e`) and calls `ensureInfrastructure` [repo].
- A **fully booted** arm64 AVD (`sys.boot_completed` = 1, 9.3 step 5). Set `ANDROID_SERIAL` if more than one device is attached.
- Expo Go installed on the emulator once:
  ```bash
  cd apps/mobile && npx expo start --android --port 8082
  ```
  Stop it after Expo Go opens. The harness waits up to 6 min for Expo Go otherwise.
- Ports 8082 and 8090 free.

```bash
emulator -avd Pixel_6_API_35 -no-snapshot-save -no-boot-anim &
adb wait-for-device shell 'while [ "$(getprop sys.boot_completed)" != 1 ]; do sleep 2; done'
caffeinate -dimsu npm run test:mobile:maestro      # about 50 min for the full suite (Windows reference)
```
Verify: the harness ends with every flow passed and exit code 0 (`echo $?`).
- **Regions** renames some flows: `check-area.js` → `check-location.js`, `map-preview-profile` → `map-placeholder-profile`, `card-who-near-me` → `card-holders-region`, `wishlist-match-notification` → `wishlist-alert-notification`.

### 9.6 Physical iPhone or Android phone (optional)
Why: only if you want a real device; the simulator and emulator cover everything the harnesses need.
- The App Store / Play Store Expo Go supports one SDK at a time. It opens this app only while the store version is still SDK 57; once SDK 58 goes stable (in beta now), it stops. Expo CLI can install a matching Expo Go only on simulators and emulators.
- A phone cannot reach `localhost`. Point the app at the Mac's LAN IP:
  ```bash
  IP=$(ipconfig getifaddr en0)     # the Mac's Wi-Fi IP
  printf 'EXPO_PUBLIC_API_BASE_URL=http://%s:8080\nEXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=%s:9099\n' "$IP" "$IP" >> apps/mobile/.env
  ```
  (`apps/mobile/.env` is git-ignored [repo].)
- System Settings > Privacy & Security > Local Network: allow Terminal (and any app you start Metro from).

Verify:
```bash
curl -s http://$(ipconfig getifaddr en0):8080/actuator/health    # {"status":"UP",...} with the API running
```

---

## 10. Optional

### 10.1 Python ML service: ON HOLD (Phase 11)
Only the Phase 0 skeleton tests run. Do not start Phase 11 work, and keep `mlScanning` off.

Why the venv matters: `apps/ml` needs Python 3.12+, and the `python3` of the Command Line Tools is 3.9. Since 2026-10-10 `npm run test:ml` checks the version: without `apps/ml/.venv` it also looks for `python3.12` to `python3.14` on PATH, and when nothing fits it says which Python it found ("python3 on PATH is Python 3.9.6" on the owner's Mac [proven 2026-10-10]) and prints the commands below.
```bash
brew install python@3.12
cd apps/ml && python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt
cd ../.. && npm run test:ml
# run it (no script starts it): cd apps/ml && .venv/bin/uvicorn app.main:app --reload --port 8000
```
Verify:
```bash
apps/ml/.venv/bin/python --version    # 3.12.x
```
`apps/ml/README.md` and the `npm run test:ml` messages show `.venv/bin` paths on macOS since 2026-10-10 (they were Windows `.venv/Scripts` paths).

### 10.2 Card catalogue
- Seeds, tests and CI never call YGOPRODeck.
- The card metadata and `card_image` rows live in the Postgres volume; the folders only hold files. Pick one:
  - **(a) Re-import on the Mac (default).** Needs the running API and network (the import checks the DB version first, reuses the stored snapshot, stays at 5 requests/second or less, and keeps the image cache at 5 GB or less):
    ```bash
    npm run api:dev                  # terminal 1: the import runs inside the API
    npm run catalog:import           # terminal 2
    npm run card-images:status
    ```
  - **(b) Move the DB and both folders from Windows** (optional): "Before you switch" step 3, then 7.5.

Verify:
```bash
npm run card-images:status    # "used" MB above 0 and the 5120 MiB limit
```

### 10.3 Other optional pieces
- `npm run generate:api` installs `@openapitools/openapi-generator-cli` into `packages/api-client/tools` and downloads the generator jar 7.25.0. It needs `java` on PATH.
- The compose `pubsub` profile (port 8085) and `app` profile (API and web images) are optional.

Verify (only if you use them): `npm run generate:api && git status --short packages/api-client` shows no unexpected changes.

---

## 11. Final checklist

| Tool | Version | Verify |
|---|---|---|
| macOS | 27 (or Tahoe 26.6+) | `sw_vers -productVersion` |
| Xcode CLT | current | `xcode-select -p` |
| Homebrew | current | `brew --version` |
| Rosetta 2 (Apple Silicon) | n/a | `arch -x86_64 /usr/bin/true && echo ok` (needed for Docker Desktop; with OrbStack use the container check of 4.4) |
| Claude Code CLI | ≥ 2.1.284 (2.1.296 on 2026-10-09) | `claude --version && claude doctor` |
| Claude login | Max account, no API key | `/status`, `/usage`; `echo $ANTHROPIC_API_KEY` is empty |
| Bypass + Ultracode | `orenji` alias (or 2.7 settings) | `type orenji && cat ~/.claude/settings.json` |
| gh | current | `gh auth status` |
| git | CLT or brew, on `main` | `git -C ~/dev/OrenjiTrade branch --show-current` |
| Docker Desktop, or OrbStack (4.4) | current, Compose v2, Rosetta on, socket on, starts at sign-in | `docker run --rm hello-world && docker compose version && ls -l /var/run/docker.sock` |
| amd64 emulation | Rosetta, not QEMU | `docker run --rm --platform linux/amd64 alpine sh -c 'uname -m; grep -m1 "model name" /proc/cpuinfo'` prints `x86_64` and `VirtualApple` |
| JDK | Temurin 21 recommended; a newer default JDK also works (5) | `java -version && echo $JAVA_HOME` |
| Gradle daemon JVM | Java 21, pinned in the repo | `cd apps/api && ./gradlew --version` shows "Daemon JVM: Compatible with Java 21" |
| Node | 24.21.0 (24.15+) | `node -v` |
| npm | 11.19.0 (bundled) | `npm -v` |
| Playwright Chromium | for 1.63.0 | `ls ~/Library/Caches/ms-playwright` |
| Terraform | 1.16.x via hashicorp/tap (≥ 1.9) | `terraform version` |
| Xcode | 27.x (or 26.4+) | `xcodebuild -version` |
| iOS runtime | iOS 27 (or 26.x) | `xcrun simctl list runtimes` |
| Android Studio + SDK tools | current (not on the owner's Mac yet, 2026-10-10) | `adb version && sdkmanager --version` |
| AVD | arm64-v8a, API 35/34 | `emulator -list-avds && adb devices` |
| ANDROID_HOME | `~/Library/Android/sdk` (for `sdkmanager`, `emulator` and Expo CLI; the Maestro harness finds that folder by itself) | `echo $ANDROID_HOME` |
| Maestro | latest | `maestro --version` |
| Watchman (opt.) | latest | `watchman --version` |
| Python (opt.) | 3.12 | `apps/ml/.venv/bin/python --version` |
| Repo smoke | n/a | `npm run test:scripts && npm run infra:up` |

### 11.1 Check that Claude sees the same toolchain
Why: fnm lives in `~/.zshrc` and everything else in `~/.zprofile`; Claude's Bash tool must see both, and the desktop app is launched from the GUI rather than a terminal.

Start `orenji`, then type at the prompt:
```
!node -v && java -version && echo $JAVA_HOME $ANDROID_HOME && which maestro terraform adb
```
Verify: v24.21.0, a JDK (Temurin 21, or a newer one), both paths set, and three paths printed. Repeat it once in the desktop app's Code tab. If something is missing only there, move that export (fnm included) into `~/.zprofile` and restart the app (unverified).

---

## 12. Known repo issues on macOS

Each item: where, what breaks, the workaround, and the fix to make in the repo. Items marked **Fixed 2026-10-10** were fixed in the repo that day (branch `chore/macos-ios-dev`, then `main` once merged); their original description stays for the record (the file and line references are those of 2026-10-09), and the workaround is only needed on a branch that does not have the fix yet. Items 14-21 are not code bugs. Items 22-24 were found on the first Mac run.

### 12.1 Scripts
1. **`scripts/lib/mobile-maestro.mjs:78-81`** (same on main and regions): `adbPath()` falls back to the Linux path `~/Android/Sdk/platform-tools/adb` on every non-Windows OS, so `test:mobile:maestro` reports "No Android device is ready".
   Workaround: `export ANDROID_HOME=$HOME/Library/Android/sdk` with `$ANDROID_HOME/platform-tools` on PATH (bare `adb` is the last resort), or `ln -s ~/Library/Android/sdk ~/Android/Sdk`. Fix later: add a `~/Library/Android/sdk` branch for darwin.
   **Fixed 2026-10-10.** The harness looks in `ANDROID_HOME`, `ANDROID_SDK_ROOT`, then `~/Library/Android/sdk` on macOS (`adbCandidates` in `scripts/lib/host-tools.mjs`, unit-tested). Not run against a device: the owner's Mac has no Android SDK yet.
2. **`scripts/lib/mobile-maestro.mjs:63,65,172` and every `apps/mobile/.maestro/*.yaml`** (`appId host.exp.exponent`): the Maestro harness is Android-only (`EMULATOR_HOST 10.0.2.2`, `expo start --port 8082 --android --clear`). No harness drives the iOS simulator.
   Workaround: run native E2E on an arm64 Android AVD and check iOS by hand (`npm run ios -w apps/mobile`).
3. **`scripts/lib/mobile-maestro.mjs:16, 252, 259-261`**: the hints point to `%LOCALAPPDATA%/Android/Sdk/emulator` and `MAESTRO_BIN=D:/maestro/bin/maestro.bat`, which mislead on a Mac.
   Workaround: ignore them; put `maestro` on PATH or in `~/.maestro/bin` (found automatically, line 92), or set `MAESTRO_BIN=$HOME/.maestro/bin/maestro`. Fix later: platform-specific hints.
   **Fixed 2026-10-10.** The messages are per platform (`noAndroidDeviceMessage`, `maestroNotFoundMessage` in `scripts/lib/host-tools.mjs`, unit-tested), and "No Android device is ready" also says when adb itself is missing. Seen on the owner's Mac: `npm run test:mobile:maestro` prints the macOS emulator path and "adb was not found in ANDROID_HOME, ANDROID_SDK_ROOT or ~/Library/Android/sdk".
4. **`scripts/infra-validate.mjs:32`**: tells you to `brew install terraform`. That is now a broken instruction: homebrew-core removed the formula on 2026-04-13, and the command fails with "No available formula".
   Workaround: `brew tap hashicorp/tap && brew install hashicorp/tap/terraform` (1.16.5, matching CI's 1.16.x). Fix later: change the hint to the tap.
   **Fixed 2026-10-10.** The hint is per platform (`terraformInstallHint`, unit-tested): the tap on macOS, winget on Windows, the install page on Linux.
5. **`docker-compose.yml:14` and `apps/api/src/test/java/com/orenjitrade/api/TestcontainersConfiguration.java:23`**: `postgis/postgis:17-3.5` (and every 17-3.x tag) is linux/amd64 only. On Apple Silicon, `npm run dev` and `test:api` run it emulated: slower, with platform-mismatch warnings. macOS 27 is the last release with full Rosetta; after that Docker falls back to QEMU, which is slow but not a hard block.
   Workaround: Rosetta 2 (1.4) and Docker's Rosetta option (4.2). Fix later: a native arm64 image (e.g. `imresamu/postgis:17-3.5-alpine`) is a code + CLAUDE.md/ADR change and needs an owner decision before macOS 28 (fall 2027).
   **Partly fixed 2026-10-10.** `docker-compose.yml` names `platform: linux/amd64` for PostGIS: on an Apple Silicon engine an unpinned pull is refused ("no matching manifest for linux/arm64/v8", HTTP 404 from Docker 29.4 under OrbStack). Testcontainers needs no change: version 2.0.5 retries the refused pull with linux/amd64 by itself, proven with an amd64-only image that was not cached, and `TestcontainersConfiguration` records this. The emulation and the arm64 image decision stay open (owner).
6. **Testcontainers socket** (no repo config: no `testcontainers.properties`, no `DOCKER_HOST`): on macOS Testcontainers needs `/var/run/docker.sock` or `~/.docker/run/docker.sock`.
   Workaround: Docker Desktop > Settings > Advanced > "Allow the default Docker socket to be used" (4.2). With Colima, the three exports in 4.3. With OrbStack nothing: it links `/var/run/docker.sock` to its own socket and Testcontainers finds it [proven 2026-10-10] (4.4).
7. **`scripts/test.mjs:112-126`** (`mlPython`; regions :113-126): uses `apps/ml/.venv/bin/python`, otherwise the first `python3`/`python` on PATH, with no version check. On a Mac without the venv that is the CLT `/usr/bin/python3` (about 3.9), and `test:ml` fails.
   Workaround: create `apps/ml/.venv` with `python3.12` (10.1). Fix later: check the version and say so.
   **Fixed 2026-10-10.** `npm run test:ml` reads the Python version, also tries `python3.12` to `python3.14`, and says which Python it found when none is 3.12+ (`chooseMlPython`, `mlPythonMissingMessage`, unit-tested). Seen on the owner's Mac: "Python 3.12+ not found: python3 on PATH is Python 3.9.6". The ML tests themselves were not run (no Python 3.12 there; ML is on hold).
8. **`scripts/test.mjs:137`**: the error message says `.venv/Scripts/pip` (with only a parenthetical for `bin/pip`); `apps/ml/README.md:49-71` also uses Windows `.venv/Scripts` paths.
   Workaround: use `.venv/bin/pip` and `.venv/bin/uvicorn`. Fix later: print the platform's path.
   **Fixed 2026-10-10.** The messages print `.venv/bin/pip` on macOS and Linux and `.venv\Scripts\pip` on Windows (`mlVenvCommands`, unit-tested), and `apps/ml/README.md` shows the macOS and Linux commands first.
9. **`scripts/lib/web-e2e.mjs:257-258`**: the process-name checks `/^java(\.exe)?$/` and `/^node(\.exe)?$/` never match on macOS, because `ps -o comm=` (`scripts/lib/util.mjs:496-504`) prints the full executable path. `npm run test:e2e -- --stop` then relies only on the lsof listener check. Low impact.
   Workaround: if a kept stack isn't stopped, kill the PIDs from `lsof -nP -iTCP:8180 -sTCP:LISTEN` and `-iTCP:4300`. Fix later: match the basename.
   **Fixed 2026-10-10.** `--stop` compares the base name of the executable (`isProcessImage` in `scripts/lib/web-e2e-guard.mjs`, unit-tested and checked against a live `java` process on the owner's Mac). A real `--keep-running` / `--stop` round trip was not run that day.
10. **`scripts/lib/web-e2e-guard.mjs:58` and `106-110`**: `SAME_CASE = process.platform !== 'win32'`, so the dev-directory isolation guard compares paths case-sensitively on macOS, although APFS is case-insensitive by default. A differently cased `CARD_IMAGE_CACHE_DIR` or `STORAGE_LOCAL_ROOT` override could slip past the guard that protects your card-image cache.
    Workaround: keep the default paths, or override them with exactly the same casing. Fix later: fold case on darwin too (`web-e2e-guard.test.mjs:80` only asserts win32).
    **Fixed 2026-10-10.** The web and mobile guards compare paths case-insensitively on macOS as on Windows (`ignoresPathCase`, `comparablePath`). The new tests fail without the change on the owner's Mac (APFS). On a case-sensitive volume the guards are only stricter.

### 12.2 Docs
11. **`docs/development/local-setup.md:18` and `README.md:67`** say "JDK 17 or newer", but `apps/api/build.gradle.kts:160` (regions :180) and `apps/api/README.md:9` say Gradle must run on JDK 21+ (Spotless with google-java-format 1.30.0). With JDK 17 as JAVA_HOME, `spotlessCheck`/`check` fails.
    Workaround: `brew install --cask temurin@21` and `export JAVA_HOME=$(/usr/libexec/java_home -v 21)` (5).
    **Fixed 2026-10-10.** Both documents now say that a JDK only launches `./gradlew` and that Gradle runs on Java 21 by itself (item 22).
12. **`docs/development/local-setup.md:507-508`** gives the Playwright cache as `~/.cache/ms-playwright` for non-Windows; on macOS it is `~/Library/Caches/ms-playwright`. Harmless otherwise.
    **Fixed 2026-10-10.** The document names the three locations.
13. **`docs/development/local-setup.md:338` and `apps/mobile/README.md:526-530`** (regions: :335 and :489-494): the emulator and Maestro examples are Windows-only (`%LOCALAPPDATA%` emulator path, `MAESTRO_BIN=D:/maestro/bin/maestro.bat`). `local-setup.md:21` and `README.md:69` say "`python` on Windows" with no macOS equivalent.
    Workaround: `$ANDROID_HOME/emulator/emulator`, `maestro` on PATH, and `python3.12`. Fix later: add a macOS section to the docs.
    **Fixed 2026-10-10 in `local-setup.md` and `README.md`**, which give the macOS form of the emulator, Maestro and Python lines. **Still open:** `apps/mobile/README.md` keeps its Windows-only Maestro examples; it is rewritten with the iOS harness (item 2).

### 12.3 Not code bugs, but they block a Mac
14. **Android AVDs from Windows** (`Pixel_6_API_34`, `Pixel_3a`, x86_64 images) do not carry over, and x86_64 images do not run on Apple Silicon.
    Workaround: create an arm64-v8a AVD (9.3), then install Expo Go once with `cd apps/mobile && npx expo start --android --port 8082` (hint at `scripts/lib/mobile-maestro.mjs:211`).
15. **Line endings:** the Windows clone uses `core.autocrlf=true`. Copying it would put CRLF into `infrastructure/docker/firebase-emulator/entrypoint.sh` and `apps/api/gradlew` and break the emulator image and Gradle.
    Workaround: always `gh repo clone` fresh and leave `core.autocrlf` unset (`.gitattributes` forces LF; both files are 100755 in the index).
16. **GitHub default branch is `master`** (f13b686, same tree as `main`), so a fresh clone lands on `master`.
    Workaround: `git switch main` right after cloning (3.3).
17. **Claude Code auto-memory** (`C:\Users\yunji\.claude\projects\C--dev-OrenjiTrade\memory\*.md`) is keyed by the Windows path and contains Windows-only facts.
    Workaround: copy it into `~/.claude/projects/-Users-<you>-dev-OrenjiTrade/memory/` after the first session and edit those facts (3.5).
18. **Branch availability:** `feature/regions-s2-wishlist` has no upstream, so a Mac clone does not get it.
    Workaround: `git push -u origin feature/regions-s2-wishlist` from `C:/dev/OrenjiTrade-regions` once the background workflow finishes ("Before you switch", step 1).
19. **Branch switching on one Docker DB:** regions adds Flyway V106-V112 and main ends at V105, so main's API fails Flyway validation against a regions-migrated DB.
    Workaround: `npm run infra:reset` when going back to main; it wipes the DB volumes and `apps/api/.local-storage` (7.8).
20. **`security/npm-audit-allowlist.json`:** the node-forge and braces entries expire on 2026-11-30, after which `npm run audit:gate` fails on every machine, Mac included.
    Workaround: re-evaluate those advisories and update the allowlist before that date (repo task).
21. **Git-ignored local data does not travel with a clone:** `apps/api/.local-storage` (695 MB card-image cache) and `apps/api/.local-dev` (72 MB YGOPRODeck snapshots). Copying the folders alone gives orphan files, because the catalogue and image rows live in the Postgres volume.
    Workaround: move the DB with them (`pg_dump`/`pg_restore`, then `npm run card-images:reconcile` with the API running; "Before you switch" step 3 and 7.5), or re-run the explicit, rate-limited `npm run catalog:import` with the API running (10.2).

### 12.4 Found on the first Mac run (2026-10-10)
22. **`apps/api` Gradle build:** the Gradle daemon followed the machine's default JDK. With Temurin 27 as the only system JDK, `npm run test:api` failed in `spotlessCheck` (google-java-format 1.30.0: `NoSuchFieldError ... EndPosTable endPositions`).
    **Fixed 2026-10-10.** `apps/api/gradle/gradle-daemon-jvm.properties` pins the daemon to Java 21 (5). Until a branch has that file: `export JAVA_HOME=<a JDK 21>` before Gradle or an npm script, and if the error stays, it is a cached result: `cd apps/api && ./gradlew spotlessCheck --rerun-tasks`. A worktree that failed before needs that command once more after the file arrives (5).
23. **`scripts/lib/util.mjs` `findJava21()`:** it took the first Java 21 or newer, so the E2E harnesses ran the API jar on Java 27 here, and it never saw the JDK Gradle provisions on macOS, which sits one directory deeper (`~/.gradle/jdks/<install>/jdk-21.x/Contents/Home`) than the paths it checked.
    **Fixed 2026-10-10.** `ORENJI_JAVA_HOME` first (it also works from `.env`), then an exact Java 21 (`JAVA_HOME` first), a newer Java only with a warning (5); unit-tested in `scripts/lib/util.test.mjs`. A full E2E run with it was not done that day.
24. **`scripts/lib/util.mjs` "Docker is not running":** the hint named only Docker Desktop and its "Engine running" label.
    **Fixed 2026-10-10.** It names OrbStack too.
25. **API start-up log on macOS:** every start prints `WARN ... DnsServerAddressStreamProviders : Can not find io.netty.resolver.dns.macos.MacOSDnsServerAddressStreamProvider in the classpath, fallback to system defaults. This may result in incorrect DNS resolutions on MacOS.`
    Expected noise, not fixed: PostgreSQL, Redis and the Auth emulator are on `localhost`, so nothing depends on that resolver locally. The remedy would be the `io.netty:netty-resolver-dns-native-macos` runtime dependency for local runs only.

---

## 13. Troubleshooting (likely Mac issues)

| Symptom | Cause | Fix |
|---|---|---|
| `zsh: command not found: claude` | `~/.local/bin` is not on PATH | Add it to `~/.zprofile` (2.1); `which -a claude`. |
| Claude bills the API | `ANTHROPIC_API_KEY` exported somewhere | Remove it from `~/.zprofile`/`~/.zshrc`, `unset ANTHROPIC_API_KEY`, check `/status`. |
| `claude doctor`: "macOS Keychain is not writable" | Keychain locked | Unlock the login keychain in Keychain Access, then `/login`. |
| Bypass refused | Started with sudo/root, or the setting is in a project file | Run as your user; use the `orenji` alias (2.6) or put `defaultMode` in `~/.claude/settings.json` (2.7). |
| Ultracode runs at the default effort, not xhigh | `"ultracode": true` and `/effort ultracode` keep the current effort (v2.1.284+) | Start with `orenji` (`--effort ultracode`), or add `"effortLevel": "xhigh"` (2.7). |
| Mac slows down during workflows | 16 agents + Docker + emulators | `export CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS=6`, `workflowSizeGuideline=small`, or `/effort ultracode off`. |
| A long run stopped overnight | The Mac slept | `caffeinate -dimsu <command>` (1.6). |
| Clone is on `master` / `git log` shows f13b686 | GitHub's default branch is `master` | `git switch main` (3.3). |
| "Docker is not running (docker info failed)" | Docker Desktop or OrbStack not started | Start it; turn on "Start Docker Desktop when you sign in" (4.1). OrbStack: open the app or `orbctl start`; `app.start_at_login` is off on the owner's Mac (4.4). |
| `The operation couldn't be completed. Unable to locate a Java Runtime` | `/usr/bin/java` stub, no JDK | Section 5. |
| `spotlessCheck`: `NoSuchFieldError ... EndPosTable endPositions`, or another google-java-format error | A Gradle daemon on JDK 27 (or 17): a branch without `apps/api/gradle/gradle-daemon-jvm.properties`, or a cached result of such a run | Merge the 2026-10-10 macOS fixes into the branch (they pin the daemon to Java 21), or `export JAVA_HOME=<a JDK 21>`. Then `cd apps/api && ./gradlew spotlessCheck --rerun-tasks`. `./gradlew --stop` stops every Gradle daemon of that version, a running `npm run dev` API included. |
| E2E harness warns "The API jar will run on Java 27 ..., but CI and production run Java 21" | `ORENJI_JAVA_HOME` (in the shell or in `.env`) points at a newer JDK, or the harness found no Java 21 on the machine | Point `ORENJI_JAVA_HOME` at a JDK 21, or remove it when the machine has a Java 21 that the harness finds by itself (5). |
| E2E harness says "JAVA_HOME is Java 27, so it is not used" | `JAVA_HOME` points at a newer JDK and the machine has a Java 21 | Nothing to do: the API jar runs on Java 21 like CI and production. To run it on another Java, set `ORENJI_JAVA_HOME` (5). |
| `docker compose up` / `docker pull`: "no matching manifest for linux/arm64/v8 in the manifest list entries" | PostGIS is amd64-only and the platform was not named (a branch whose `docker-compose.yml` lacks `platform: linux/amd64`, or a manual pull) | Merge the 2026-10-10 macOS fixes into the branch, or pull it once: `docker pull --platform linux/amd64 postgis/postgis:17-3.5`. |
| First `npm run test:api` on a Mac logs `NotFoundException ... no matching manifest for linux/arm64/v8` once | Testcontainers' first, unpinned pull of PostGIS is refused | Expected: it pulls linux/amd64 by itself right after. Nothing to do. |
| `The requested image's platform (linux/amd64) does not match…` | postgis is amd64-only | Expected warning. Keep Docker's Rosetta option on. |
| PostGIS or `test:api` very slow or timing out | QEMU instead of Rosetta (off by default in Docker Desktop), or too little Docker RAM | Docker Desktop: turn Rosetta on, use the Apple Virtualization framework, give Docker 6-8 GB+ (4.2). OrbStack: `orbctl config show` must print `rosetta: true`. Either way, the container check of 4.4 must print `VirtualApple`, not a QEMU CPU. |
| Testcontainers: "Could not find a valid Docker environment" | No socket at `/var/run/docker.sock` | Enable "Allow the default Docker socket" (4.2), or Colima's environment variables (4.3). OrbStack creates the link itself (4.4): start OrbStack. |
| `infra:up`: port 5432 or 6379 in use | Homebrew postgres/redis running | `brew services stop postgresql@17 redis`, or set `POSTGRES_PORT`/`REDIS_PORT` in `.env`. |
| Firebase emulator image build fails | No internet on first build, or CRLF `entrypoint.sh` | Connect; never copy files from the Windows tree; `git checkout -- infrastructure/docker`. |
| Bind-mount error for the postgres init folder | Repo outside `/Users` | Clone under `~/`, or add the path in Docker > Resources > File sharing. |
| API: Flyway "Validate failed … migration V106…" | DB migrated by regions, now on main | `npm run infra:reset` (wipes local data and the card cache; 7.8). |
| Cards show placeholder images after copying the folders | The catalogue rows are in the Postgres volume, not the folders | Restore the DB (7.5) and run `npm run card-images:reconcile`, or `npm run catalog:import` (10.2). |
| `catalog:import` / `card-images:*` cannot connect | No running API | `npm run api:dev` in another terminal first. |
| Every seed account asks for an "Age" step | Seeds have no `AGE_CONFIRMATION` consent | Expected once per account (7.6). |
| macOS asks whether "java" or "node" may accept connections | Firewall on | Allow (7.6). |
| `test:mobile:maestro`: "No Android device is ready" | No booted AVD; when it adds "adb was not found ...", no Android SDK at all (the owner's Mac on 2026-10-10) | Install the SDK and an arm64 AVD (9.3), boot it, check `adb devices`. Set `ANDROID_HOME` only when the SDK is not in `~/Library/Android/sdk`. |
| Maestro or `expo start --android` fails right after the emulator starts | Android had not finished booting | Wait for `sys.boot_completed` = 1 (9.3 step 5). |
| "Maestro CLI not found" | Not on PATH and not in `~/.maestro/bin` | Install it (9.4), or `MAESTRO_BIN=$HOME/.maestro/bin/maestro`. |
| `sdkmanager` stops at a licence prompt or "licenses not accepted" | Licences not accepted before install | `yes \| sdkmanager --licenses`, then install again (9.3). |
| Emulator won't start / "x86 emulation currently requires hardware acceleration" | x86_64 system image | Use an arm64-v8a image. |
| Expo Go "incompatible SDK" on the simulator/emulator | Old Expo Go on the device | Delete it; `npx expo start` reinstalls the SDK 57 build. |
| Expo Go "incompatible SDK" on a physical phone | Store Expo Go has moved past SDK 57 | Use the simulator or emulator (9.6). |
| Phone can't reach the API | `localhost` in the app, or Local Network blocked | LAN IP in `apps/mobile/.env`, allow Terminal under Local Network (9.6). |
| `expo start --ios` fails / no simulator | Xcode < 26.4 or no iOS runtime | Install Xcode 27 (macOS 26.6+) or Xcode 26.4-26.6 from developer.apple.com/download (Tahoe 26.2+); `xcodebuild -downloadPlatform iOS`. |
| `open -a Simulator`: "Unable to find application" | Xcode 27 renamed it DeviceHub | `open -a DeviceHub`, or `xcrun simctl boot "iPhone 17"`. |
| `brew install terraform`: "No available formula" | Formula removed from homebrew-core (2026-04-13) | `brew tap hashicorp/tap && brew install hashicorp/tap/terraform`. |
| `test:ml`: "Python 3.12+ not found: python3 on PATH is Python 3.9.6" | No venv; the system Python is 3.9 | Section 10.1 (the message prints the commands). |
| `audit:gate` fails after 2026-11-30 | Allowlist entries expired | Re-evaluate node-forge/braces and update `security/npm-audit-allowlist.json` (repo task). |
| `npm run test:e2e -- --stop` doesn't recognise the kept stack | A branch from before 2026-10-10: `ps -o comm=` prints full paths on macOS | Merge the 2026-10-10 macOS fixes into the branch (12 item 9); otherwise stop the PIDs from `lsof -nP -iTCP:8180 -sTCP:LISTEN`. |
| A commit shows `<user>@<host>.local` as its author | git `user.name` / `user.email` are not set (the owner's Mac on 2026-10-10) | Section 3.1. |
| `npm ci` EBADENGINE / Angular errors | Node < 24.15 | `fnm install 24 && fnm use 24`. |
| Claude's `!java -version` differs from your terminal | Claude (or the desktop app) doesn't load the same profile | 11.1. |
| Branch S2 missing after clone | Never pushed | Push from Windows ("Before you switch", step 1). |
