# TxLINE Devnet Setup

Use devnet for every value in this flow. Do not mix a devnet subscription transaction with the mainnet API host.

## Constants

```ts
const NETWORK = "devnet";
const RPC_URL = "https://api.devnet.solana.com";
const API_ORIGIN = "https://txline-dev.txodds.com";
const API_BASE_URL = "https://txline-dev.txodds.com/api";
const PROGRAM_ID = "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J";
const TXL_TOKEN_MINT = "4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG";
const SERVICE_LEVEL_ID = 1;
const DURATION_WEEKS = 4;
const SELECTED_LEAGUES: number[] = [];
```

## What You Need To Produce

Fill these in `app/.env`:

```bash
VITE_TXLINE_ENABLE_LIVE=true
VITE_TXLINE_COMPETITION_ID=
TXLINE_API_ORIGIN=https://txline-dev.txodds.com
TXLINE_GUEST_JWT=<jwt from /auth/guest/start>
TXLINE_API_TOKEN=<token from /api/token/activate>
```

Leave `VITE_TXLINE_COMPETITION_ID` blank unless you know the TxLINE World Cup competition id.

Vite proxies local `/txline/...` requests and injects the server-only credentials. Production uses the Railway proxy configured by `VITE_TXLINE_PROXY_URL`, so the JWT and API token are never compiled into the browser bundle.

## Fast Path

Run the helper from `app/`:

```bash
npm install
npm run txline:devnet
```

By default it uses your Solana CLI keypair at `~/.config/solana/id.json`.

To use another devnet keypair:

```bash
npm run txline:devnet -- --keypair=/absolute/path/to/id.json
```

The script prints the exact `.env` lines after it:

- requests a devnet airdrop if your balance is low,
- creates your Token-2022 TxL associated token account if it does not exist,
- submits the free TxLINE devnet subscription,
- starts a guest session,
- signs the activation message,
- activates the API token.

## Flow

1. Install the helper dependencies in the environment where you run the subscription script.

```bash
npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token axios tweetnacl
```

2. Configure your wallet/provider against devnet.

```ts
const connection = new Connection("https://api.devnet.solana.com", "confirmed");
```

3. Load the TxLINE devnet IDL and program id.

```ts
const programId = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
```

4. Subscribe to the free devnet tier.

```ts
const SERVICE_LEVEL_ID = 1;
const DURATION_WEEKS = 4;
const SELECTED_LEAGUES: number[] = [];

const txSig = await program.methods
  .subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)
  .accounts({
    user: provider.wallet.publicKey,
    pricingMatrix: pricingMatrixPda,
    tokenMint: txlTokenMint,
    userTokenAccount,
    tokenTreasuryVault,
    tokenTreasuryPda,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

5. Start a devnet guest session.

```ts
const authResponse = await axios.post("https://txline-dev.txodds.com/auth/guest/start");
const jwt = authResponse.data.token;
```

6. Sign the activation message. With `SELECTED_LEAGUES = []`, the message is:

```ts
const messageString = `${txSig}::${jwt}`;
```

7. Activate the API token on the devnet host.

```ts
const activationResponse = await axios.post(
  "https://txline-dev.txodds.com/api/token/activate",
  {
    txSig,
    walletSignature,
    leagues: SELECTED_LEAGUES,
  },
  {
    headers: { Authorization: `Bearer ${jwt}` },
  },
);

const apiToken = activationResponse.data.token || activationResponse.data;
```

8. Put `jwt` and `apiToken` into `app/.env`, restart Vite, and open `/pools`.

```bash
npm run dev
```

## Values For This App

The browser-safe configuration is:

- `VITE_TXLINE_ENABLE_LIVE`
- optionally `VITE_TXLINE_COMPETITION_ID`

The local Vite proxy and deployed backend read these server-only values:

- `TXLINE_API_ORIGIN`
- `TXLINE_GUEST_JWT`
- `TXLINE_API_TOKEN`

The Solana values are only needed while generating the TxLINE subscription and activated API token.
