# Repository Guidelines

## 文档说明
文档都写到 notes_gpt 目录,md格式, 中文命名

## Project Structure & Module Organization
- `contracts/`: Solidity sources (Pancake* DEX, OLA, Staking and bases, interfaces, utils, tokens).
- `scripts/`: Hardhat scripts to deploy and demo (`deploy*.js`, `usePancakeSwap.js`).
- `test/`: Hardhat/ethers tests (`*.test.js`, integration and network checks).
- `hardhat.config.js`: Solidity 0.8.28, optimizer enabled, viaIR, network presets (localhost, BSC, BSC testnet).
- Generated: `artifacts/`, `cache/`. Docs/notes live in root (`README.md`, deployment guides). `othercode/` holds reference copies; not part of the main build.

## Build, Test, and Development Commands
- Install: `npm install`
- Compile: `npm run compile` (Hardhat compile)
- Local chain: `npm run node` (keeps a dev blockchain running)
- Deploy (examples): `npm run deploy` (HelloWorld), `npm run deploy-pancake`, `npm run deploy-ola -- --network localhost`
- Test: `npm test` (all), or targeted:
  - `npm run test-network`
  - `npm run test-direct`
  - `npm run test-system`
- Full suite helper: `npm run test-all` (runs `./run-all-tests.sh`, expects a running local node)

## Coding Style & Naming Conventions
- Solidity: 4-space indent, SPDX headers, NatSpec on public/external APIs.
- Types: Contracts/interfaces PascalCase (`StakingBase`, `IStaking`); functions/vars camelCase; constants UPPER_SNAKE; internal helpers prefixed `_`.
- Prefer explicit visibility and `immutable/constant` where applicable. Keep optimizer/viaIR settings unless justified.

## Testing Guidelines
- Place tests in `test/` with `*.test.js` names. Use Hardhat Toolbox (Mocha/Chai, ethers v6).
- Start a local node before networked tests: `npm run node` then pass `--network localhost` or use provided scripts.
- Aim to cover: staking flows, referral rewards, liquidity interactions, failure paths (reverts, limits).

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, `chore:`; optional scope, e.g. `feat(staking): add tier calc`
- PRs should include: purpose, linked issues, what changed, how to test (commands), and notable gas/security impacts.
- Keep PRs focused and small; include screenshots/logs for test output where helpful.

## Security & Configuration Tips
- Never commit private keys. For live networks, inject credentials via env and extend Hardhat config locally.
- Mainnet-specific checks (e.g., EOA enforcement) must remain enabled in production builds.
- Validate slippage and limits before deploying parameter changes.
