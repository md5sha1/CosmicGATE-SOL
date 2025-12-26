import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { NftPredictionStakeV1 } from "../target/types/nft_prediction_stake_v1";
import {
  createMint,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, SystemProgram, PublicKey } from "@solana/web3.js";
import { assert } from "chai";

describe("nft_prediction_stake", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.nftPredictionStakeV1 as Program<NftPredictionStakeV1>;
  const admin = provider.wallet;

  let gateMint: PublicKey;
  let treasuryPda: PublicKey;
  let treasuryBump: number;

  before(async () => {
    // Create a test token mint for tGATE
    gateMint = await createMint(
      provider.connection,
      (admin as anchor.Wallet).payer,
      admin.publicKey,
      null,
      9 // 9 decimals
    );
    console.log("Gate Mint created:", gateMint.toBase58());

    // Derive treasury PDA
    [treasuryPda, treasuryBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury")],
      program.programId
    );
    console.log("Treasury PDA:", treasuryPda.toBase58());
  });

  it("Initialize treasury", async () => {
    const treasuryGateAta = getAssociatedTokenAddressSync(
      gateMint,
      treasuryPda,
      true // allowOwnerOffCurve for PDA
    );

    const tx = await program.methods
      .initTreasury()
      .accountsStrict({
        treasury: treasuryPda,
        gateMint: gateMint,
        treasuryGateAta: treasuryGateAta,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("initTreasury tx:", tx);

    // Verify treasury was initialized
    const treasuryAccount = await program.account.treasury.fetch(treasuryPda);
    assert.ok(treasuryAccount.admin.equals(admin.publicKey));
    assert.ok(treasuryAccount.gateMint.equals(gateMint));
    console.log("Treasury initialized successfully!");
  });

  it("Initialize match pool", async () => {
    const matchId = new anchor.BN(1);

    const [matchPoolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("match_pool"), matchId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    const tx = await program.methods
      .initMatchPool(matchId, 3) // max 3 NFTs per user
      .accountsStrict({
        matchPool: matchPoolPda,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("initMatchPool tx:", tx);

    // Verify match pool was initialized
    const matchPool = await program.account.matchPool.fetch(matchPoolPda);
    assert.ok(matchPool.matchId.eq(matchId));
    assert.ok(matchPool.admin.equals(admin.publicKey));
    assert.equal(matchPool.maxNftsPerUser, 3);
    assert.equal(matchPool.resolved, false);
    console.log("Match pool initialized successfully!");
  });
});
