# Dextron

A small DEX I built to understand how an automated market maker actually works under the hood. It is a Uniswap V1 style ETH ↔ ERC20 swap with a single liquidity pool. The whole thing is here: the Solidity contracts, a Foundry test suite with full coverage, and a React frontend that talks to a live deployment on the Sepolia testnet.

There is one pair and one pool. You can swap ETH for the test token, swap the test token back to ETH, add liquidity to the pool, or remove the liquidity you added. That is the entire feature set. Nothing more.

The repo is split into two halves:

- **`contracts/`** is a Foundry project. It contains `SwapX.sol` (the AMM, which is also the LP token) and `Token.sol` (a plain ERC20 used as the trading pair), plus a deploy script and a full test suite.
- **The React app at the project root** is a Vite single page app. It connects a wallet through RainbowKit, reads pool state, and sends swap and liquidity transactions through ethers.

Both halves are wired together. The frontend reads the contract addresses from a `.env` file and uses ABIs that are checked in under `src/abis/`. There is a small `sync-abis.sh` helper inside `contracts/` that regenerates those ABIs from the Foundry build output, so the two stay in sync if you change the contracts.

---

## What is actually deployed

Both contracts are live on Sepolia (chain id `11155111`).

| Contract | Address | What it is |
|---|---|---|
| SwapX | `0x530745b2F4cEa32D9cae829A155EEd198b063d18` | The AMM. Also the LP token (name `ULTRON`, symbol `ULTRN`). |
| TOKEN | `0xA50f618Eb09584F2d89890A6BC798dB7886Ab607` | A plain ERC20 used as the trading pair. Symbol `TKN`, 18 decimals, fixed supply of 1,000,000. |

The TOKEN contract has no public `mint` function. The full supply was minted to the deployer at deployment time, so to get test tokens you either need them sent to you or you need to swap ETH for them through the pool.

The frontend talks to these two addresses through environment variables in `.env`. If you redeploy your own copy, change the addresses there.

---

## How the AMM works (the math)

This is the part most people skip, but it is the whole reason the contract exists. So here it is in plain language.

### The constant product rule

The pool holds two reserves:

- `x` = ETH sitting in the contract
- `y` = TOKEN sitting in the contract

The contract enforces one rule: after every swap, `x * y` should not get smaller. This product `k = x * y` is what people call the constant. It is not literally constant because the 1% fee bumps it up a little after each trade, but that is the idea.

When you swap, you give the pool some amount `dx` of one side and the pool gives you back some amount `dy` of the other side, picked so that the new reserves still satisfy the rule:

```
(x + dx) * (y - dy) = x * y
```

Solving for `dy`:

```
dy = (y * dx) / (x + dx)
```

That is the price. There is no oracle. There is no order book. The price comes out of this single equation. The bigger your trade is compared to the pool, the worse the price you get. That is slippage, and it is built into the math.

### The 1% fee

The contract adds a small twist. It does not let your full input count toward the trade. It only counts 99% of it:

```
dy = (99 * dx * y) / (100 * x + 99 * dx)
```

The other 1% stays in the pool, which means the LPs end up with slightly more reserves than they started with after every swap. That is how liquidity providers earn money. There is no separate fee account. The fee just sits inside the reserves and makes everyone's LP share worth a tiny bit more.

This is exactly the function `getOutputAmountFromSwap` in the contract:

```solidity
uint256 inputAmountWithFee = inputAmount * 99;
uint256 numerator = inputAmountWithFee * outputReserve;
uint256 denominator = (inputReserve * 100) + inputAmountWithFee;
return numerator / denominator;
```

### A worked example

Say the pool currently holds 10 ETH and 20,000 TKN. You want to swap 1 ETH for tokens.

```
x  = 10
y  = 20,000
dx = 1
```

With the 1% fee:

```
dy = (99 * 1 * 20,000) / (100 * 10 + 99 * 1)
   = 1,980,000 / 1,099
   ≈ 1,801.6 TKN
```

So you put in 1 ETH and get back about 1,801.6 TKN. Notice you did not get 2,000 TKN, which would be the simple "1 ETH = 2,000 TKN" rate. You got less because:

- The pool charges a 1% fee.
- Your trade is large relative to the pool (10% of the ETH side), so it moves the price against you.

After the swap the pool holds 11 ETH and about 18,198.4 TKN. The new price for the next person is worse, which is the whole point of the curve.

If instead the pool had 1,000 ETH and 2,000,000 TKN and you swapped 1 ETH, you would get about 1,979.2 TKN, very close to the 2,000 ratio. Bigger pool, less slippage. That is why deep liquidity matters.

### Adding liquidity

The first person to add liquidity sets the price. Whatever ratio they choose becomes the starting ratio. They get LP tokens equal to the amount of ETH they put in (in wei). From the contract:

```solidity
if (tokenReserveBalance == 0) {
    token.transferFrom(msg.sender, address(this), amountOfToken);
    lpTokensToMint = ethReserveBalance;   // == msg.value
    _mint(msg.sender, lpTokensToMint);
}
```

Everyone after that has to match the existing ratio. The contract calculates how many tokens are required for the ETH you sent:

```
requiredTokens = (msg.value * tokenReserve) / ethReserveBefore
```

You have to approve at least that many tokens, but the contract only pulls `requiredTokens` from your wallet, not the full amount you typed. So if you over-approve, you do not get rugged on the extra. The amount of LP tokens you receive is:

```
lpMinted = (totalLPSupply * msg.value) / ethReserveBefore
```

That formula keeps your share of the pool proportional to the ETH you contributed, which keeps everyone's existing share intact.

#### Example

Pool has 10 ETH, 20,000 TKN, and 10 LP tokens outstanding (the deployer's first deposit). You want to add 2 ETH.

```
requiredTokens = (2 * 20,000) / 10 = 4,000 TKN
lpMinted       = (10 * 2) / 10     = 2 LP tokens
```

You hand over 2 ETH and 4,000 TKN, you get 2 LP tokens, and you now own `2 / (10 + 2)` ≈ 16.67% of the pool.

### Removing liquidity

When you burn LP tokens, you get back a proportional slice of both reserves:

```
ethBack    = (ethReserve    * lpAmount) / lpTotalSupply
tokenBack  = (tokenReserve  * lpAmount) / lpTotalSupply
```

Continuing the example above, if you burn your 2 LP tokens when the pool still has 12 ETH and 24,000 TKN and a total supply of 12 LP:

```
ethBack    = (12 * 2) / 12    = 2 ETH
tokenBack  = (24,000 * 2) / 12 = 4,000 TKN
```

Same as you put in, ignoring fees and price movement. If trading happened while you were in the pool, the reserves grew because of the fees, and you would get a bit more out than you put in. You also carry impermanent loss risk: if the price moved a lot, the mix of ETH and TKN you get back will be different from what you deposited, even if the dollar value is similar.

The frontend currently only supports removing 100% of your LP tokens at once. The contract itself accepts any amount, so partial removal is possible if you call it directly.

---

## Repository layout

```
.
├── README.md                 You are here.
├── package.json              React 19, Vite 7, wagmi, viem, ethers v6, RainbowKit, Tailwind.
├── vite.config.js
├── vercel.json               Vercel deployment config.
├── tailwind.config.js
├── postcss.config.js
├── eslint.config.js
├── index.html                Vite entry.
├── .env                      Frontend env: contract addresses + WalletConnect project id.
├── public/
│   └── ULTRON.jpg            Logo / favicon source.
├── src/                      The React app.
│   ├── main.jsx              React root.
│   ├── App.jsx               WagmiProvider + QueryClientProvider + RainbowKitProvider wrapper.
│   ├── AppContent.jsx        Header, connect button, Swap / Liquidity tabs.
│   ├── index.css             Tailwind + glass-effect class.
│   ├── App.css
│   ├── abis/
│   │   ├── SwapX.json        ABI of the AMM (auto-generated from Foundry build).
│   │   └── Token.json        ABI of the test ERC20.
│   ├── hooks/
│   │   └── useContracts.js   Builds ethers Contract instances from window.ethereum.
│   ├── components/
│   │   ├── SwapInterface.jsx    Swap UI.
│   │   ├── Liquidity.jsx        Add / remove liquidity UI.
│   │   └── UI/Button.jsx        Shared button with loading state.
│   └── utils/
│       ├── config.js         wagmi / RainbowKit config (chains: sepolia, mainnet).
│       └── constants.js      Re-exports env vars.
└── contracts/                Foundry project.
    ├── foundry.toml
    ├── remappings.txt        Generated; ignored by git.
    ├── sync-abis.sh          Copies fresh ABIs from out/ into ../src/abis/.
    ├── lib/                  forge-std, openzeppelin-contracts (git submodules).
    ├── src/
    │   ├── SwapX.sol         The AMM. Inherits OZ ERC20 for the LP token.
    │   └── Token.sol         The trading pair ERC20.
    ├── test/
    │   ├── SwapX.t.sol       30 tests + fuzz, covering math, LP, swaps, invariants.
    │   └── Token.t.sol
    └── script/
        └── Deploy.s.sol      Deploys both contracts, optionally seeds liquidity.
```

---

## How the smart contracts are organised

There are two contracts and they are both small enough to read in one sitting.

### `Token.sol`

Standard OpenZeppelin `ERC20`. The constructor mints `1_000_000 * 10**18` tokens to whoever deploys it. Name `TOKEN`, symbol `TKN`. There is no `mint`, no `burn`, no owner. Whatever exists at deploy time is what exists forever.

### `SwapX.sol`

The whole AMM is in this one file. It inherits OpenZeppelin `ERC20` so the LP token (`ULTRON` / `ULTRN`) just works as any other ERC20 — you can `transfer` your LP shares to someone else and they can redeem them.

Public functions:

| Function | Visibility | Description |
|---|---|---|
| `tokenAddress()` | view | Address of the paired ERC20. Set once in the constructor. |
| `getReserve()` | view | Token reserve currently held by the pool. ETH reserve is just `address(this).balance`. |
| `getOutputAmountFromSwap(dx, x, y)` | pure | The constant-product output formula with 1% fee. |
| `addLiquidity(amountOfToken)` | payable | Deposit ETH (via `msg.value`) and tokens. Mints LP tokens. |
| `removeLiquidity(lpAmount)` | nonpayable | Burn LP tokens, withdraw a proportional slice of both reserves. |
| `ethToTokenSwap(minTokensOut)` | payable | Swap ETH for tokens with a slippage guard. |
| `tokenToEthSwap(tokensIn, minEthOut)` | nonpayable | Swap tokens for ETH with a slippage guard. |

Plus everything you get from being an ERC20: `balanceOf`, `transfer`, `approve`, `transferFrom`, `totalSupply`, etc.

A few details worth noting:

- The first call to `addLiquidity` sets the price. It mints LP tokens equal to the wei amount of ETH deposited.
- After that, `addLiquidity` only pulls the matching token amount from your wallet, not whatever number you typed in. The `amountOfToken` argument is just an upper bound that prevents the contract from silently consuming more than you authorised.
- `getOutputAmountFromSwap` reverts if either reserve is zero, which is what stops anyone from swapping against an empty pool.
- The fee is hardcoded at 1% (`* 99 / 100` math). There is no admin function to change it.

### Why no `factory`, no `router`, no second pair?

This is a learning project, not a production DEX. Building all of that would not teach you anything new about the AMM mechanics. The single-pair contract is the smallest thing that demonstrates `x*y=k`, fees, LP minting, and impermanent loss. Adding a factory and a router would just be plumbing.

---

## Running the contracts locally

You need [Foundry](https://book.getfoundry.sh/getting-started/installation). Once you have it:

```bash
cd contracts
forge install                # one-time, pulls forge-std and openzeppelin-contracts
forge build
forge test
forge test -vvv              # verbose output, show traces on failures
forge coverage --report summary
```

The current state of the suite:

```
Token.sol  : 100% lines, 100% statements, 100% functions
SwapX.sol  : 100% lines, 100% statements, 100% branches, 100% functions
Total      : 30 tests, 2 fuzz tests at 256 runs each, all green
```

### What the tests cover

`test/Token.t.sol` (7 tests):

- Metadata is correct (`name`, `symbol`, `decimals`).
- Initial supply is minted to the deployer in full.
- `transfer` works and reverts on insufficient balance.
- `approve` plus `transferFrom` works, and `transferFrom` reverts without allowance.
- A fuzz test on `transfer` for arbitrary bounded amounts.

`test/SwapX.t.sol` (23 tests):

- Constructor sets the token address, sets the LP metadata to `ULTRON / ULTRN`, and reverts on a zero token address.
- `getReserve()` is zero before any liquidity is added.
- The `getOutputAmountFromSwap` formula matches the math against a known vector (the README's "10 ETH / 20,000 TKN, swap 1 ETH" example), and reverts on zero reserves.
- A fuzz test that the output is always strictly less than the output reserve (you can never drain the pool).
- The first `addLiquidity` mints LP equal to wei of ETH deposited.
- A subsequent `addLiquidity` pulls only the ratio amount from the depositor and mints LP proportional to the ETH contribution.
- `addLiquidity` reverts when the depositor offers fewer tokens than the ratio requires.
- `removeLiquidity` returns the depositor's exact share, supports partial burn, and reverts on a zero burn.
- `removeLiquidity` distributes accrued fees: after a third party swaps through the pool, the remaining LP holder withdraws more ETH than they originally deposited.
- `ethToTokenSwap` delivers exactly the quoted amount, reverts when the slippage guard is too tight, and reverts on an empty pool.
- `tokenToEthSwap` delivers exactly the quoted amount, reverts when the slippage guard is too tight, and reverts on an empty pool.
- An invariant check: `k = x * y` strictly grows after every swap (because of the fee).
- A fuzz test that swap output stays within reserves and never zeroes the pool.
- The LP token can be transferred to another address, and that address can redeem it.

### Deploying your own copy

`script/Deploy.s.sol` deploys both contracts. The deployer keeps the full token supply. Optionally, if you set `SEED_ETH` and `SEED_TOKENS` env variables, the script also adds the first round of liquidity in the same transaction batch, which avoids the chicken-and-egg problem of needing tokens before the pool exists.

```bash
# Local fork (anvil)
anvil &
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

# Sepolia
PRIVATE_KEY=0x... \
SEED_ETH=100000000000000000   \   # 0.1 ether in wei
SEED_TOKENS=200000000000000000000 \ # 200 tokens in wei
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC --broadcast --verify
```

After deployment, run `./sync-abis.sh` from the `contracts/` directory and update the addresses in the project root `.env`. The frontend will pick up both changes on the next dev server restart.

---

## How the frontend is wired up

`App.jsx` sets up three providers in this order:

1. `WagmiProvider` with the config from `utils/config.js`. The configured chains are Sepolia and mainnet, but the app actively blocks anything that is not Sepolia.
2. `QueryClientProvider` from TanStack Query, which RainbowKit and wagmi use internally.
3. `RainbowKitProvider` with a dark theme and `coolMode` turned on.

`AppContent.jsx` reads the connected account through `useAccount()`. If there is no wallet, it shows a connect prompt. If the wallet is on the wrong chain, it shows a "wrong network" message. Only on Sepolia does it render the tab UI for Swap and Liquidity.

`useContracts.js` builds two ethers `Contract` objects, one for SwapX and one for TOKEN, using the signer from `window.ethereum` directly. It watches the `isConnected` flag and rebuilds the contracts when the wallet connects or disconnects. This is a slight inconsistency in the codebase: wagmi is used for account and chain state, but ethers is used for actual contract calls. It works, but a fully wagmi-native version would use `useWriteContract` and friends instead.

`SwapInterface.jsx` does three things:

- Reads ETH and TOKEN balances every time the account or contracts change.
- Calls `getOutputAmountFromSwap` whenever you type in the input field, so the "to" amount updates live.
- Sends the swap transaction. It hardcodes a 1% slippage tolerance (the `minOut` it sends to the contract is 99% of the quoted output).

`Liquidity.jsx` reads the pool reserves, your LP balance, the total LP supply, and your share percentage. Adding liquidity does an `approve` if needed and then calls `addLiquidity`. Removing liquidity always burns your full LP balance.

Notifications are plain `alert()` calls. There is no toast library.

---

## How to use the app

1. Get yourself some Sepolia ETH from any faucet (search "Sepolia faucet").
2. Open the app and click Connect Wallet. Use a wallet that supports Sepolia, such as MetaMask or any WalletConnect option.
3. Switch your wallet to the Sepolia network. If you forget, the app will tell you.
4. To get test tokens, go to the Swap tab and trade some ETH for TKN. There is no faucet for TKN, the only way to obtain it is by swapping or being sent some.
5. To add liquidity, switch to the Liquidity tab. Enter the amount of ETH you want to deposit. The app will suggest a matching token amount based on the current pool ratio. You will be asked to approve the token spend first, then to confirm the `addLiquidity` transaction.
6. To remove liquidity, click "Remove All Liquidity". This is all-or-nothing in the UI. There is no slider for partial withdrawal.

A few things to keep in mind:

- The first swap in a brand-new pool can fail or give a strange price because there is nothing on one side. If you are running this against a fresh deployment, add liquidity first.
- Slippage is fixed at 1% in the swap UI. If the market moves more than that between quote and confirmation, the transaction will revert with `Tokens received are less than minimum tokens expected` (or the reverse for the other direction). That is the contract doing its job.
- Gas is paid in Sepolia ETH. If your ETH balance is too low to cover gas plus the swap value, the transaction will fail. The "Max" button leaves a small ETH buffer for gas.

---

## Running the frontend locally

You need Node 18 or newer.

```bash
git clone <this-repo>
cd Dextron
npm install
```

Create a `.env` file in the project root with these three keys:

```
VITE_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
VITE_SWAPX_ADDRESS=0x530745b2F4cEa32D9cae829A155EEd198b063d18
VITE_TOKEN_ADDRESS=0xA50f618Eb09584F2d89890A6BC798dB7886Ab607
```

Get a free WalletConnect project id from `https://cloud.walletconnect.com/`. The two contract addresses are the ones already deployed on Sepolia, so you can use them as is.

Then:

```bash
npm run dev      # local dev server on http://localhost:5173
npm run build    # production build to dist/
npm run preview  # serve the production build locally
npm run lint
```

The `vercel.json` file is set up so you can deploy straight to Vercel without extra config.

---

## Tech stack

| Layer | Tool |
|---|---|
| Smart contracts | Solidity 0.8.30, OpenZeppelin Contracts v5.0.2 |
| Contract tooling | Foundry (`forge`, `cast`, `anvil`) |
| UI framework | React 19 |
| Build tool | Vite 7 |
| Styling | Tailwind CSS 3 |
| Wallet connection | RainbowKit + wagmi + viem |
| Contract calls | ethers v6 |
| Async state | TanStack Query |
| Icons | lucide-react |
| Hosting | Vercel |

---

## Known limits and rough edges

These are not bugs to hide. They are real things about the project worth knowing.

- One pair only. ETH and one ERC20. No multi-hop, no token list, no pool factory.
- Slippage is fixed at 1% in the UI. There is no slippage settings panel.
- "Remove liquidity" in the UI is always 100% of your LP balance. The contract supports partial removal, the frontend does not.
- Notifications are `window.alert()`. Loud and ugly, but it works.
- The favicon path in `index.html` points at `/public/ULTRON.jpg`, which is wrong for Vite. Files in `public/` are served from the root, so the correct path is `/ULTRON.jpg`. As written, the favicon will 404 in production.
- `utils/constants.js` has an Alchemy RPC URL hardcoded in a `SUPPORTED_CHAINS` object that is never imported anywhere. It is dead code.
- `config.js` sets `ssr: true` even though this is a client-only SPA. It is harmless but inaccurate.
- `useContracts.js` reads from `window.ethereum` instead of using the wagmi-provided client. If the user has multiple wallets installed and the active one is not the injected one, this can pick the wrong wallet.
- The `.env` file is committed in the repo. The WalletConnect project id is technically public anyway, but be careful before adding anything sensitive to it.
- The contract has no events. `addLiquidity`, `removeLiquidity`, and the swap functions could all emit events for indexers, but they do not. You only see the inherited ERC20 `Transfer` and `Approval` events.
- `removeLiquidity` uses `transfer` to send ETH. That has a 2300 gas stipend, which works for EOAs and most wallets but can break for smart contract LPs that need more gas in their receive function. Replacing it with a `call` would be more robust.

If any of these annoy you, they are good first issues to fix.

---

## License

No license file is included. Treat it as "all rights reserved" until one is added. If you want to fork it, open an issue and ask.
