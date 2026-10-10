# OrenjiTrade on a MacBook, from zero

The goal: a new Apple Silicon MacBook (M-series, macOS 27 "Golden Gate") that (a) runs Claude Code on your Max plan with bypass permissions and Ultracode, and (b) compiles, runs and tests the whole OrenjiTrade monorepo, locally and for free (no EAS, no cloud).

To continue the work on the Mac after setup, start Claude in the repo and ask it to read [claude-handoff.md](claude-handoff.md).

Researched 2026-10-09 by reading the repo (main @ 7420905 and the regions worktree `feature/regions-s2-wishlist` @ d76f8a4) and the official docs, then reviewed against the Homebrew, Docker Hub and Node APIs and the Claude Code, Expo, Apple, Docker and Maestro docs. Nothing was installed or run on a Mac. Tags used below:
- **[repo]** read in the repo. Line numbers are `main` unless labelled "regions".
- **[docs]** from the tool's official page or API.
- **[memory]** standard command, not re-checked on an official page.
- **(unverified)** not confirmed. Check it on the Mac.
- **Intel Mac:** marks the only places where an Intel Mac differs.

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
Why: `postgis/postgis:17-3.5` exists only for linux/amd64 [docs: Docker Hub, 2026-10-09]. Every PostGIS container, in `npm run dev` and in Testcontainers, runs under x86 emulation, and Docker Desktop's Rosetta option needs Rosetta installed.
```bash
softwareupdate --install-rosetta --agree-to-license   # [memory]
```
Verify [memory]:
```bash
arch -x86_64 /usr/bin/true && echo "rosetta ok"
```
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

## 4. Docker Desktop

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
- **OrbStack is not free** for commercial or freelance use.

Verify:
```bash
docker compose version && docker run --rm hello-world
```

---

## 5. Java 21

Why it must be 21 and on PATH/JAVA_HOME (not only a Gradle toolchain):
- `scripts/lib/util.mjs:182-190` runs `sh ./gradlew`, which needs a JDK to start the Gradle daemon. On a fresh Mac `/usr/bin/java` is only a stub [repo].
- Spotless runs **google-java-format 1.30.0 inside the Gradle daemon** (`apps/api/build.gradle.kts:157-170`, the JDK 21+ comment at :160; regions :177-191 and :180). The `languageVersion 21` toolchain only covers compilation, so a daemon on JDK 17 fails `spotlessCheck`/`check` [repo].
- The E2E harnesses look for JDK 21 through `findJava21()` (`scripts/lib/util.mjs:626-658`: `ORENJI_JAVA_HOME`, then `JAVA_HOME`, then `java` on PATH, then `~/.gradle/jdks/*/Contents/Home`) [repo].
- Maestro needs Java 17+, and openapi-generator needs Java 11+.
- Ignore `docs/development/local-setup.md:18` and `README.md:67`, which say "JDK 17+". That is wrong (12).

```bash
brew install --cask temurin@21     # [docs]
echo 'export JAVA_HOME="$(/usr/libexec/java_home -v 21)"' >> ~/.zprofile && source ~/.zprofile
```
Verify:
```bash
/usr/libexec/java_home -v 21     # /Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home [memory]
java -version                    # openjdk version "21.0.x" ... Temurin
echo $JAVA_HOME
```
- No global Gradle is needed. The wrapper downloads Gradle 9.7.1.
- If no JDK 21 is found, Gradle's foojay resolver can auto-download one into `~/.gradle/jdks`. With Temurin installed, that doesn't happen.

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
- `ORENJI_JAVA_HOME` (optional): a JDK 21 for the E2E jar.
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
- Expect a platform warning for postgis (`linux/amd64` on `arm64`). That is normal.
- "Docker is not running" means Docker Desktop isn't started (4.1).
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
| `npm run test:api` | `gradlew check`, re-run every time: Spotless + unit + Testcontainers (`postgis/postgis:17-3.5`, `redis:7-alpine`, Ryuk) | Needs JDK 21 as JAVA_HOME and `/var/run/docker.sock`. PostGIS is emulated, so expect it to be slower than about 5 min / 704 tests on Windows. **Main:** `gradlew test --rerun check` (scripts/test.mjs:60). **Regions:** `gradlew test --rerun catalogTest --rerun check` (scripts/test.mjs:61), so the containers start twice. |
| `npm run test:web` | Angular Vitest + lint | No extra steps. |
| `npm run test:e2e` | Isolated stack: API jar on :8180 (DB `orenjitrade_e2e`), web on :4300, Playwright Chromium | Installs Chromium itself (`scripts/lib/web-e2e.mjs:521`). It never touches your dev DB or cache. |
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
`docs/development/local-setup.md:507-508` says `~/.cache/ms-playwright`; that path is wrong on macOS. `--with-deps` is only needed on Linux.

### Terraform (validate only, never apply)
Why: every `versions.tf` requires `>= 1.9`, and CI uses 1.16.x. **`brew install terraform` fails** ("No available formula"): homebrew-core removed the formula on 2026-04-13 [docs: formulae.brew.sh], although `scripts/infra-validate.mjs:32` still suggests it.
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
   Verify: `echo $ANDROID_HOME && sdkmanager --version` (sdkmanager and Maestro both use `JAVA_HOME`, Temurin 21).
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
maestro --version     # needs JAVA_HOME (Temurin 21 is fine)
```
Brew alternative [docs]: `brew tap mobile-dev-inc/tap && brew install mobile-dev-inc/tap/maestro`. If brew refuses the tap formula as untrusted, run `brew trust --formula mobile-dev-inc/tap/maestro` (in Maestro's macOS docs) and install again.

### 9.5 Environment the mobile harnesses need on macOS

| Harness | Needs |
|---|---|
| `npm run test:mobile` | Nothing extra: typecheck + expo lint + Jest + harness guard tests, no device. |
| `npm run test:mobile:e2e` | Docker running; JDK 21 (`JAVA_HOME`, or `ORENJI_JAVA_HOME`); ports 8090 and 19006 free. The harness runs `expo export --platform web`, then `expo serve` on :19006, the API jar on :8090 (DB `orenjitrade_mobile_e2e`, Redis db 1), then Playwright. |
| `npm run test:mobile:maestro` | See the list below. |

`test:mobile:maestro` needs:
- **`ANDROID_HOME=$HOME/Library/Android/sdk`**, or `adb` on PATH. Without it, the harness falls back to the Linux path `~/Android/Sdk` (`scripts/lib/mobile-maestro.mjs:78-81`) and reports "No Android device is ready".
- `maestro` on PATH or in `~/.maestro/bin`. Otherwise set `MAESTRO_BIN=$HOME/.maestro/bin/maestro`. Ignore the `maestro.bat` hint.
- `JAVA_HOME` (for Maestro) and a JDK 21 for the API jar.
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

Why the venv matters: without `apps/ml/.venv`, `scripts/test.mjs:112-126` (`mlPython`) falls back to the system `python3`, which is 3.9 from the Command Line Tools and fails.
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
`apps/ml/README.md:49-71` and the `scripts/test.mjs:137` error message show Windows `.venv/Scripts` paths. On a Mac they are `.venv/bin`.

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
| Rosetta 2 (Apple Silicon) | n/a | `arch -x86_64 /usr/bin/true && echo ok` |
| Claude Code CLI | ≥ 2.1.284 (2.1.296 on 2026-10-09) | `claude --version && claude doctor` |
| Claude login | Max account, no API key | `/status`, `/usage`; `echo $ANTHROPIC_API_KEY` is empty |
| Bypass + Ultracode | `orenji` alias (or 2.7 settings) | `type orenji && cat ~/.claude/settings.json` |
| gh | current | `gh auth status` |
| git | CLT or brew, on `main` | `git -C ~/dev/OrenjiTrade branch --show-current` |
| Docker Desktop | current, Compose v2, Rosetta on, socket on, starts at sign-in | `docker run --rm hello-world && docker compose version && ls /var/run/docker.sock` |
| Temurin JDK | 21 | `java -version && echo $JAVA_HOME` |
| Node | 24.21.0 (24.15+) | `node -v` |
| npm | 11.19.0 (bundled) | `npm -v` |
| Playwright Chromium | for 1.63.0 | `ls ~/Library/Caches/ms-playwright` |
| Terraform | 1.16.x via hashicorp/tap (≥ 1.9) | `terraform version` |
| Xcode | 27.x (or 26.4+) | `xcodebuild -version` |
| iOS runtime | iOS 27 (or 26.x) | `xcrun simctl list runtimes` |
| Android Studio + SDK tools | current | `adb version && sdkmanager --version` |
| AVD | arm64-v8a, API 35/34 | `emulator -list-avds && adb devices` |
| ANDROID_HOME | `~/Library/Android/sdk` | `echo $ANDROID_HOME` |
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
Verify: v24.21.0, Temurin 21, both paths set, and three paths printed. Repeat it once in the desktop app's Code tab. If something is missing only there, move that export (fnm included) into `~/.zprofile` and restart the app (unverified).

---

## 12. Known repo issues on macOS (to be fixed in the repo)

Each item: where, what breaks, the workaround today, and the fix to make later in the repo.

### 12.1 Scripts
1. **`scripts/lib/mobile-maestro.mjs:78-81`** (same on main and regions): `adbPath()` falls back to the Linux path `~/Android/Sdk/platform-tools/adb` on every non-Windows OS, so `test:mobile:maestro` reports "No Android device is ready".
   Workaround: `export ANDROID_HOME=$HOME/Library/Android/sdk` with `$ANDROID_HOME/platform-tools` on PATH (bare `adb` is the last resort), or `ln -s ~/Library/Android/sdk ~/Android/Sdk`. Fix later: add a `~/Library/Android/sdk` branch for darwin.
2. **`scripts/lib/mobile-maestro.mjs:63,65,172` and every `apps/mobile/.maestro/*.yaml`** (`appId host.exp.exponent`): the Maestro harness is Android-only (`EMULATOR_HOST 10.0.2.2`, `expo start --port 8082 --android --clear`). No harness drives the iOS simulator.
   Workaround: run native E2E on an arm64 Android AVD and check iOS by hand (`npm run ios -w apps/mobile`).
3. **`scripts/lib/mobile-maestro.mjs:16, 252, 259-261`**: the hints point to `%LOCALAPPDATA%/Android/Sdk/emulator` and `MAESTRO_BIN=D:/maestro/bin/maestro.bat`, which mislead on a Mac.
   Workaround: ignore them; put `maestro` on PATH or in `~/.maestro/bin` (found automatically, line 92), or set `MAESTRO_BIN=$HOME/.maestro/bin/maestro`. Fix later: platform-specific hints.
4. **`scripts/infra-validate.mjs:32`**: tells you to `brew install terraform`. That is now a broken instruction: homebrew-core removed the formula on 2026-04-13, and the command fails with "No available formula".
   Workaround: `brew tap hashicorp/tap && brew install hashicorp/tap/terraform` (1.16.5, matching CI's 1.16.x). Fix later: change the hint to the tap.
5. **`docker-compose.yml:14` and `apps/api/src/test/java/com/orenjitrade/api/TestcontainersConfiguration.java:23`**: `postgis/postgis:17-3.5` (and every 17-3.x tag) is linux/amd64 only. On Apple Silicon, `npm run dev` and `test:api` run it emulated: slower, with platform-mismatch warnings. macOS 27 is the last release with full Rosetta; after that Docker falls back to QEMU, which is slow but not a hard block.
   Workaround: Rosetta 2 (1.4) and Docker's Rosetta option (4.2). Fix later: a native arm64 image (e.g. `imresamu/postgis:17-3.5-alpine`) is a code + CLAUDE.md/ADR change and needs an owner decision before macOS 28 (fall 2027).
6. **Testcontainers socket** (no repo config: no `testcontainers.properties`, no `DOCKER_HOST`): on macOS Testcontainers needs `/var/run/docker.sock` or `~/.docker/run/docker.sock`.
   Workaround: Docker Desktop > Settings > Advanced > "Allow the default Docker socket to be used" (4.2). With Colima, the three exports in 4.3.
7. **`scripts/test.mjs:112-126`** (`mlPython`; regions :113-126): uses `apps/ml/.venv/bin/python`, otherwise the first `python3`/`python` on PATH, with no version check. On a Mac without the venv that is the CLT `/usr/bin/python3` (about 3.9), and `test:ml` fails.
   Workaround: create `apps/ml/.venv` with `python3.12` (10.1). Fix later: check the version and say so.
8. **`scripts/test.mjs:137`**: the error message says `.venv/Scripts/pip` (with only a parenthetical for `bin/pip`); `apps/ml/README.md:49-71` also uses Windows `.venv/Scripts` paths.
   Workaround: use `.venv/bin/pip` and `.venv/bin/uvicorn`. Fix later: print the platform's path.
9. **`scripts/lib/web-e2e.mjs:257-258`**: the process-name checks `/^java(\.exe)?$/` and `/^node(\.exe)?$/` never match on macOS, because `ps -o comm=` (`scripts/lib/util.mjs:496-504`) prints the full executable path. `npm run test:e2e -- --stop` then relies only on the lsof listener check. Low impact.
   Workaround: if a kept stack isn't stopped, kill the PIDs from `lsof -nP -iTCP:8180 -sTCP:LISTEN` and `-iTCP:4300`. Fix later: match the basename.
10. **`scripts/lib/web-e2e-guard.mjs:58` and `106-110`**: `SAME_CASE = process.platform !== 'win32'`, so the dev-directory isolation guard compares paths case-sensitively on macOS, although APFS is case-insensitive by default. A differently cased `CARD_IMAGE_CACHE_DIR` or `STORAGE_LOCAL_ROOT` override could slip past the guard that protects your card-image cache.
    Workaround: keep the default paths, or override them with exactly the same casing. Fix later: fold case on darwin too (`web-e2e-guard.test.mjs:80` only asserts win32).

### 12.2 Docs
11. **`docs/development/local-setup.md:18` and `README.md:67`** say "JDK 17 or newer", but `apps/api/build.gradle.kts:160` (regions :180) and `apps/api/README.md:9` say Gradle must run on JDK 21+ (Spotless with google-java-format 1.30.0). With JDK 17 as JAVA_HOME, `spotlessCheck`/`check` fails.
    Workaround: `brew install --cask temurin@21` and `export JAVA_HOME=$(/usr/libexec/java_home -v 21)` (5).
12. **`docs/development/local-setup.md:507-508`** gives the Playwright cache as `~/.cache/ms-playwright` for non-Windows; on macOS it is `~/Library/Caches/ms-playwright`. Harmless otherwise.
13. **`docs/development/local-setup.md:338` and `apps/mobile/README.md:526-530`** (regions: :335 and :489-494): the emulator and Maestro examples are Windows-only (`%LOCALAPPDATA%` emulator path, `MAESTRO_BIN=D:/maestro/bin/maestro.bat`). `local-setup.md:21` and `README.md:69` say "`python` on Windows" with no macOS equivalent.
    Workaround: `$ANDROID_HOME/emulator/emulator`, `maestro` on PATH, and `python3.12`. Fix later: add a macOS section to the docs.

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
| "Docker is not running (docker info failed)" | Docker Desktop not started | Start it; turn on "Start Docker Desktop when you sign in" (4.1). |
| `The operation couldn't be completed. Unable to locate a Java Runtime` | `/usr/bin/java` stub, no JDK | Section 5. |
| `spotlessCheck` / google-java-format error | Gradle daemon on JDK 17 | `JAVA_HOME` = 21; `cd apps/api && sh ./gradlew --stop`, then retry. |
| `The requested image's platform (linux/amd64) does not match…` | postgis is amd64-only | Expected warning. Keep Docker's Rosetta option on. |
| PostGIS or `test:api` very slow or timing out | QEMU instead of Rosetta (Rosetta is off by default), or too little Docker RAM | Turn Rosetta on, use the Apple Virtualization framework, give Docker 6-8 GB+. |
| Testcontainers: "Could not find a valid Docker environment" | No socket at `/var/run/docker.sock` | Enable "Allow the default Docker socket" (4.2), or Colima's environment variables (4.3). |
| `infra:up`: port 5432 or 6379 in use | Homebrew postgres/redis running | `brew services stop postgresql@17 redis`, or set `POSTGRES_PORT`/`REDIS_PORT` in `.env`. |
| Firebase emulator image build fails | No internet on first build, or CRLF `entrypoint.sh` | Connect; never copy files from the Windows tree; `git checkout -- infrastructure/docker`. |
| Bind-mount error for the postgres init folder | Repo outside `/Users` | Clone under `~/`, or add the path in Docker > Resources > File sharing. |
| API: Flyway "Validate failed … migration V106…" | DB migrated by regions, now on main | `npm run infra:reset` (wipes local data and the card cache; 7.8). |
| Cards show placeholder images after copying the folders | The catalogue rows are in the Postgres volume, not the folders | Restore the DB (7.5) and run `npm run card-images:reconcile`, or `npm run catalog:import` (10.2). |
| `catalog:import` / `card-images:*` cannot connect | No running API | `npm run api:dev` in another terminal first. |
| Every seed account asks for an "Age" step | Seeds have no `AGE_CONFIRMATION` consent | Expected once per account (7.6). |
| macOS asks whether "java" or "node" may accept connections | Firewall on | Allow (7.6). |
| `test:mobile:maestro`: "No Android device is ready" with %LOCALAPPDATA% hints | `ANDROID_HOME` unset (falls back to `~/Android/Sdk`) or no booted AVD | Export `ANDROID_HOME`, boot the AVD, check `adb devices`. |
| Maestro or `expo start --android` fails right after the emulator starts | Android had not finished booting | Wait for `sys.boot_completed` = 1 (9.3 step 5). |
| "Maestro CLI not found … maestro.bat" | Not on PATH | Add `~/.maestro/bin` to PATH, or `MAESTRO_BIN=$HOME/.maestro/bin/maestro`. |
| `sdkmanager` stops at a licence prompt or "licenses not accepted" | Licences not accepted before install | `yes \| sdkmanager --licenses`, then install again (9.3). |
| Emulator won't start / "x86 emulation currently requires hardware acceleration" | x86_64 system image | Use an arm64-v8a image. |
| Expo Go "incompatible SDK" on the simulator/emulator | Old Expo Go on the device | Delete it; `npx expo start` reinstalls the SDK 57 build. |
| Expo Go "incompatible SDK" on a physical phone | Store Expo Go has moved past SDK 57 | Use the simulator or emulator (9.6). |
| Phone can't reach the API | `localhost` in the app, or Local Network blocked | LAN IP in `apps/mobile/.env`, allow Terminal under Local Network (9.6). |
| `expo start --ios` fails / no simulator | Xcode < 26.4 or no iOS runtime | Install Xcode 27 (macOS 26.6+) or Xcode 26.4-26.6 from developer.apple.com/download (Tahoe 26.2+); `xcodebuild -downloadPlatform iOS`. |
| `open -a Simulator`: "Unable to find application" | Xcode 27 renamed it DeviceHub | `open -a DeviceHub`, or `xcrun simctl boot "iPhone 17"`. |
| `brew install terraform`: "No available formula" | Formula removed from homebrew-core (2026-04-13) | `brew tap hashicorp/tap && brew install hashicorp/tap/terraform`. |
| `test:ml`: pytest/fastapi not installed for python3 | No venv; system Python 3.9 | Section 10.1. |
| `audit:gate` fails after 2026-11-30 | Allowlist entries expired | Re-evaluate node-forge/braces and update `security/npm-audit-allowlist.json` (repo task). |
| `npm run test:e2e -- --stop` doesn't recognise the kept stack | `ps -o comm=` prints full paths on macOS | Falls back to the lsof listener check; otherwise stop the PIDs from `lsof -nP -iTCP:8180 -sTCP:LISTEN`. |
| `npm ci` EBADENGINE / Angular errors | Node < 24.15 | `fnm install 24 && fnm use 24`. |
| Claude's `!java -version` differs from your terminal | Claude (or the desktop app) doesn't load the same profile | 11.1. |
| Branch S2 missing after clone | Never pushed | Push from Windows ("Before you switch", step 1). |
