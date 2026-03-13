# Support Matrix

## Official target platforms for 0.0.1

| Platform | Architectures | Notes |
| --- | --- | --- |
| macOS | `arm64`, `x64` | best-supported path |
| Linux | `arm64`, `x64` | recommended for servers and remote hosts |
| Windows | `x64` | web terminal unsupported |

## Known limitations

- web terminal unsupported on Windows
- Windows ARM64 not in the 0.0.1 target matrix
- provider changes in `runner.env` only affect new sessions

## Cross-platform guidance

- prefer AgentChat path helpers over hardcoded `/tmp` or `/bin/bash` assumptions in tests
- use `runner.env` instead of shell-profile-specific provider setup if you want the web UI and runner to behave consistently
