# Security Policy

## Supported Versions

Security fixes target the current `1.2.x` release line.

## Reporting A Vulnerability

Please do not open a public issue for a suspected vulnerability.

Send the report through GitHub private vulnerability reporting for this repository when it is available. If private reporting is not available, email the repository owner listed on GitHub.

Include:

- Affected version or commit.
- Reproduction steps.
- Expected and actual behavior.
- Any local state, environment variables, or provider CLI details needed to reproduce.

Do not include provider API keys, provider tokens, SSH keys, or private workspace files.

## Project Boundaries

ReevesAgents is a local tmux-first tool. The stable package should not:

- Store provider credentials.
- Start background services.
- Bind Web UI outside loopback.
- Write provider MCP config.
