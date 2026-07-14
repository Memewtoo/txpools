#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import nacl from 'tweetnacl'
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token'

const RPC_URL = 'https://api.devnet.solana.com'
const API_ORIGIN = 'https://txline-dev.txodds.com'
const PROGRAM_ID = new PublicKey('6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J')
const TXL_TOKEN_MINT = new PublicKey('4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG')
const SERVICE_LEVEL_ID = 1
const DURATION_WEEKS = 4
const SELECTED_LEAGUES = []

const SUBSCRIBE_DISCRIMINATOR = Buffer.from([254, 28, 191, 138, 156, 179, 183, 53])

const argValue = (name) => {
  const prefix = `--${name}=`
  const arg = process.argv.find((item) => item.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : undefined
}

const expandHome = (value) => {
  if (!value || value === '~') return os.homedir()
  return value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value
}

const keypairPath = expandHome(
  argValue('keypair') ??
    process.env.SOLANA_KEYPAIR ??
    path.join(os.homedir(), '.config', 'solana', 'id.json'),
)

const readKeypair = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Keypair file not found: ${filePath}`)
  }

  const secret = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  return Keypair.fromSecretKey(Uint8Array.from(secret))
}

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, options)
  const text = await response.text()

  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${url} failed (${response.status}): ${text}`)
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const buildSubscribeInstruction = ({ user, pricingMatrixPda, tokenTreasuryPda, tokenTreasuryVault, userTokenAccount }) => {
  const data = Buffer.alloc(SUBSCRIBE_DISCRIMINATOR.length + 3)
  SUBSCRIBE_DISCRIMINATOR.copy(data, 0)
  data.writeUInt16LE(SERVICE_LEVEL_ID, 8)
  data.writeUInt8(DURATION_WEEKS, 10)

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: pricingMatrixPda, isSigner: false, isWritable: false },
      { pubkey: TXL_TOKEN_MINT, isSigner: false, isWritable: false },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: tokenTreasuryVault, isSigner: false, isWritable: true },
      { pubkey: tokenTreasuryPda, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  })
}

const ensureTokenAccount = async ({ connection, payer, associatedTokenAccount, owner }) => {
  const existing = await connection.getAccountInfo(associatedTokenAccount, 'confirmed')
  if (existing) {
    console.log(`Token account already initialized: ${associatedTokenAccount.toBase58()}`)
    return
  }

  console.log(`Creating Token-2022 associated token account: ${associatedTokenAccount.toBase58()}`)
  const createAtaTx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      associatedTokenAccount,
      owner,
      TXL_TOKEN_MINT,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
  )

  const sig = await sendAndConfirmTransaction(connection, createAtaTx, [payer], {
    commitment: 'confirmed',
  })
  console.log(`Created token account tx: ${sig}`)
}

const main = async () => {
  console.log('TxLINE devnet activation')
  console.log(`Keypair: ${keypairPath}`)

  const payer = readKeypair(keypairPath)
  const connection = new Connection(RPC_URL, 'confirmed')

  console.log(`Wallet: ${payer.publicKey.toBase58()}`)
  const balance = await connection.getBalance(payer.publicKey)
  console.log(`Devnet SOL: ${(balance / LAMPORTS_PER_SOL).toFixed(4)}`)

  if (balance < 0.02 * LAMPORTS_PER_SOL) {
    console.log('Balance is low; requesting 1 devnet SOL airdrop...')
    const airdropSig = await connection.requestAirdrop(payer.publicKey, LAMPORTS_PER_SOL)
    const latest = await connection.getLatestBlockhash()
    await connection.confirmTransaction({ signature: airdropSig, ...latest }, 'confirmed')
  }

  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync([Buffer.from('token_treasury_v2')], PROGRAM_ID)
  const [pricingMatrixPda] = PublicKey.findProgramAddressSync([Buffer.from('pricing_matrix')], PROGRAM_ID)
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    TXL_TOKEN_MINT,
    tokenTreasuryPda,
    true,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )
  const userTokenAccount = getAssociatedTokenAddressSync(
    TXL_TOKEN_MINT,
    payer.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )

  console.log('Derived accounts:')
  console.log(`  pricingMatrixPda: ${pricingMatrixPda.toBase58()}`)
  console.log(`  tokenTreasuryPda: ${tokenTreasuryPda.toBase58()}`)
  console.log(`  tokenTreasuryVault: ${tokenTreasuryVault.toBase58()}`)
  console.log(`  userTokenAccount: ${userTokenAccount.toBase58()}`)

  await ensureTokenAccount({
    connection,
    payer,
    associatedTokenAccount: userTokenAccount,
    owner: payer.publicKey,
  })

  console.log(`Subscribing to free devnet tier: serviceLevel=${SERVICE_LEVEL_ID}, weeks=${DURATION_WEEKS}`)
  const tx = new Transaction().add(
    buildSubscribeInstruction({
      user: payer.publicKey,
      pricingMatrixPda,
      tokenTreasuryPda,
      tokenTreasuryVault,
      userTokenAccount,
    }),
  )

  const txSig = await sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: 'confirmed',
  })
  console.log(`Subscription tx: ${txSig}`)

  console.log('Starting guest session...')
  const authResponse = await requestJson(`${API_ORIGIN}/auth/guest/start`, { method: 'POST' })
  const jwt = authResponse.token ?? authResponse
  if (!jwt || typeof jwt !== 'string') {
    throw new Error('Could not read guest JWT from /auth/guest/start response.')
  }

  const messageString = `${txSig}:${SELECTED_LEAGUES.join(',')}:${jwt}`
  const signatureBytes = nacl.sign.detached(new TextEncoder().encode(messageString), payer.secretKey)
  const walletSignature = Buffer.from(signatureBytes).toString('base64')

  console.log('Activating API token...')
  const activationResponse = await requestJson(`${API_ORIGIN}/api/token/activate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      txSig,
      walletSignature,
      leagues: SELECTED_LEAGUES,
    }),
  })

  const apiToken = activationResponse.token ?? activationResponse
  if (!apiToken || typeof apiToken !== 'string') {
    throw new Error('Could not read API token from /api/token/activate response.')
  }

  console.log('\nPaste this into app/.env:\n')
  console.log(`VITE_TXLINE_ENABLE_LIVE=true`)
  console.log(`TXLINE_API_ORIGIN=${API_ORIGIN}`)
  console.log(`TXLINE_GUEST_JWT=${jwt}`)
  console.log(`TXLINE_API_TOKEN=${apiToken}`)
  console.log(`VITE_TXLINE_COMPETITION_ID=`)
  console.log('\nThen restart Vite with npm run dev.')
}

main().catch((error) => {
  console.error('\nTxLINE devnet activation failed:')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
