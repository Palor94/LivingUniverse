# Current source and startup

Updated 2026-11-11.

The project root is the current source. Launchers, MCP profiles and the three
Windows logon tasks must use its `app/` and `mcp/` directories. The earlier copy
in `99_ARCHIVE/Old project copy 2026-11-11` is retained for recovery; do not run
or edit it as the active application.

The root `.git` file points to `%LOCALAPPDATA%/LivingUniverse/source-git`.
That local metadata preserves the existing repository history, index and
configuration copied from the archive. The archive's Git metadata remains
unchanged. Existing source changes are deliberately left uncommitted. This
repair neither creates a new remote nor publishes anything.

If moving/restoring to another machine, the `.git` pointer alone is insufficient:
restore a Git bundle/repository as well, then reconnect the current source root.
Live databases, credentials and Git runtime metadata stay outside OneDrive.

`mcp/repair-startup.ps1` previews the exact existing Windows task actions.
Run it with `-Apply` to back up all three definitions and update their actions
to the current project and installed Node.js. It preserves task principals,
triggers and settings, reads back each change and attempts rollback on failure.
The installed task actions use the Windows Script Host runner `mcp/run-hidden.vbs`
to keep service consoles hidden while preserving their exit codes and the
Task Scheduler restart policy. The interactive password window remains visible.
Backups and the result journal are under `%LOCALAPPDATA%/LivingUniverse/maintenance`.

The ChatGPT tunnel uses its existing profile and encrypted runtime credential.
For a rejected credential, run `mcp/Új alagútkulcs.cmd` and enter a restricted
runtime key in its password window. It needs Tunnels Read + Use for the existing
tunnel; a normal model API key may lack this permission. Never paste keys into
chat, source, command arguments or a plaintext configuration file.

The tunnel's `health.url` file points to its loopback diagnostic listener.
System status checks successful recent cloud polling, not just whether a
process is running or `/readyz` returns 200. Authentication diagnostics expose
only a reason and HTTP status; provider error messages remain private.
