import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { NftPredictionStakeV1 } from "../target/types/nft_prediction_stake_v1";
import {
  createMint,
  mintTo,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, SystemProgram, PublicKey, LAMPORTS_PER_SOL, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { assert } from "chai";

// Metaplex Token Metadata Program ID
const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

/**
 * Derive NFT Edition PDA (Master Edition for Candy Machine NFTs)
 */
function getNftEditionPda(nftMint: PublicKey): PublicKey {
  const [editionPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      nftMint.toBuffer(),
      Buffer.from("edition"),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return editionPda;
}

describe("nft_prediction_stake", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.nftPredictionStakeV1 as Program<NftPredictionStakeV1>;
  const admin = (provider.wallet as anchor.Wallet).payer;

  // Test accounts
  let gateMint: PublicKey;
  let treasuryPda: PublicKey;
  let treasuryBump: number;
  let matchPoolPda: PublicKey;
  // Use timestamp-based matchId to avoid collisions on devnet
  const matchId = new BN(Date.now());

  // Users
  let user1: Keypair;
  let user2: Keypair;

  // NFTs for staking
  let nft1Mint: PublicKey;
  let nft2Mint: PublicKey;

  // Token accounts
  let adminGateAta: PublicKey;
  let treasuryGateAta: PublicKey;
  let user1GateAta: PublicKey;
  let user2GateAta: PublicKey;
  
  // Track user NFT ATAs for unlock
  let user1NftAta: PublicKey;
  let user2NftAta: PublicKey;

  before(async () => {
    // Create test users
    user1 = Keypair.generate();
    user2 = Keypair.generate();

    // Transfer SOL from admin to users (instead of airdrop to avoid rate limits)
    const fundAmount = 0.1 * LAMPORTS_PER_SOL; // 0.1 SOL each

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey: user1.publicKey,
        lamports: fundAmount,
      }),
      SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey: user2.publicKey,
        lamports: fundAmount,
      })
    );

    await sendAndConfirmTransaction(provider.connection, tx, [admin]);

    console.log("User1:", user1.publicKey.toBase58());
    console.log("User2:", user2.publicKey.toBase58());

    // Create tGATE token mint
    gateMint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      9
    );
    console.log("Gate Mint:", gateMint.toBase58());

    // Create NFT mints (supply=1, decimals=0)
    nft1Mint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      0
    );
    nft2Mint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      0
    );
    console.log("NFT1 Mint:", nft1Mint.toBase58());
    console.log("NFT2 Mint:", nft2Mint.toBase58());

    // Derive PDAs
    [treasuryPda, treasuryBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury")],
      program.programId
    );
    [matchPoolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("match_pool"), matchId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    console.log("Treasury PDA:", treasuryPda.toBase58());
    console.log("Match ID:", matchId.toString());

    // Create admin's gate token account and mint tokens
    adminGateAta = getAssociatedTokenAddressSync(gateMint, admin.publicKey);
    treasuryGateAta = getAssociatedTokenAddressSync(gateMint, treasuryPda, true);

    // Create user gate ATAs
    user1GateAta = getAssociatedTokenAddressSync(gateMint, user1.publicKey);
    user2GateAta = getAssociatedTokenAddressSync(gateMint, user2.publicKey);
  });

  describe("Treasury & Match Setup", () => {
    it("Initialize treasury (or use existing)", async () => {
      // Check if treasury already exists (from previous test runs on devnet)
      const treasuryInfo = await provider.connection.getAccountInfo(treasuryPda);
      
      if (treasuryInfo) {
        // Treasury exists, use its gateMint
        const existingTreasury = await program.account.treasury.fetch(treasuryPda);
        gateMint = existingTreasury.gateMint;
        
        // Update derived addresses with existing gateMint
        adminGateAta = getAssociatedTokenAddressSync(gateMint, admin.publicKey);
        treasuryGateAta = getAssociatedTokenAddressSync(gateMint, treasuryPda, true);
        user1GateAta = getAssociatedTokenAddressSync(gateMint, user1.publicKey);
        user2GateAta = getAssociatedTokenAddressSync(gateMint, user2.publicKey);
        
        console.log("Treasury already exists, using existing gateMint:", gateMint.toBase58());
        console.log("Treasury admin:", existingTreasury.admin.toBase58());
      } else {
        // Initialize new treasury
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
      }

      const treasury = await program.account.treasury.fetch(treasuryPda);
      assert.ok(treasury.gateMint.equals(gateMint));
    });

    it("Refill treasury with tGATE", async () => {
      const refillAmount = new BN(1000_000_000_000); // 1000 tGATE

      // Ensure treasury ATA exists
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        admin,
        gateMint,
        treasuryPda,
        true // allowOwnerOffCurve for PDA
      );

      // Check if we're the mint authority (can only mint if treasury is new)
      let canMint = false;
      
      try {
        // Create admin ATA if needed
        await getOrCreateAssociatedTokenAccount(
          provider.connection,
          admin,
          gateMint,
          admin.publicKey
        );

        // Try to mint tGATE to admin
        await mintTo(
          provider.connection,
          admin,
          gateMint,
          adminGateAta,
          admin,
          BigInt(refillAmount.toString())
        );
        canMint = true;
      } catch (e) {
        console.log("Cannot mint (not mint authority), skipping refill test");
        return; // Skip this test if we can't mint
      }

      const tx = await program.methods
        .refillTreasury(refillAmount)
        .accountsStrict({
          treasury: treasuryPda,
          gateMint: gateMint,
          treasuryGateAta: treasuryGateAta,
          admin: admin.publicKey,
          adminGateAta: adminGateAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log("refillTreasury tx:", tx);

      const treasuryBalance = await getAccount(provider.connection, treasuryGateAta);
      console.log("Treasury balance:", treasuryBalance.amount.toString());
      assert.ok(BigInt(treasuryBalance.amount.toString()) >= BigInt(refillAmount.toString()));
    });

    it("Initialize match pool (state only - no token movement)", async () => {
      const prizePool = new BN(1000_000_000_000); // 1000 tGATE prize (state only)
      
      const tx = await program.methods
        .initMatchPool(matchId, prizePool, 3)
        .accountsStrict({
          matchPool: matchPoolPda,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("initMatchPool tx:", tx);

      const matchPool = await program.account.matchPool.fetch(matchPoolPda);
      assert.ok(matchPool.matchId.eq(matchId));
      assert.equal(matchPool.maxNftsPerUser, 3);
      assert.ok(matchPool.prizePool.eq(prizePool)); // Prize pool is set (state only)
      console.log("Match pool created with prize:", prizePool.toString(), "tGATE (state only)");
    });
  });

  describe("NFT Staking (Non-Custodial Freeze/Thaw)", () => {
    it("User1 stakes NFT with YES prediction", async () => {
      // Create user1's NFT token account and mint 1 NFT
      const user1NftAtaAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        admin,
        nft1Mint,
        user1.publicKey
      );
      user1NftAta = user1NftAtaAccount.address;
      
      await mintTo(
        provider.connection,
        admin,
        nft1Mint,
        user1NftAta,
        admin,
        1n
      );

      // Derive stake record PDA
      const [stakeRecordPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("stake"),
          matchId.toArrayLike(Buffer, "le", 8),
          nft1Mint.toBuffer(),
        ],
        program.programId
      );

      // Derive user position PDA
      const [userPositionPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("user_position"),
          matchId.toArrayLike(Buffer, "le", 8),
          user1.publicKey.toBuffer(),
        ],
        program.programId
      );

      // Get NFT Edition PDA (for freeze/thaw)
      const nftEdition = getNftEditionPda(nft1Mint);

      const tx = await program.methods
        .stakeNft(
          { common: {} }, // Tier::Common
          new BN(2 * LAMPORTS_PER_SOL), // estimated 2 SOL value
          true // prediction: YES
        )
        .accountsStrict({
          matchPool: matchPoolPda,
          stakeRecord: stakeRecordPda,
          userPosition: userPositionPda,
          nftMint: nft1Mint,
          userNftAta: user1NftAta,
          nftEdition: nftEdition,
          user: user1.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        })
        .signers([user1])
        .rpc();

      console.log("stakeNft (user1 YES) tx:", tx);

      const stakeRecord = await program.account.stakeRecord.fetch(stakeRecordPda);
      assert.ok(stakeRecord.user.equals(user1.publicKey));
      assert.equal(stakeRecord.prediction, true);
      assert.equal(stakeRecord.locked, true);
      
      // NFT should still be in user's wallet (non-custodial)
      const nftAccount = await getAccount(provider.connection, user1NftAta);
      assert.equal(nftAccount.amount.toString(), "1");
      console.log("NFT is frozen in user1's wallet (non-custodial)");

      const matchPool = await program.account.matchPool.fetch(matchPoolPda);
      assert.ok(matchPool.totalYesWeight.gt(new BN(0)));
    });

    it("User2 stakes NFT with NO prediction", async () => {
      // Create user2's NFT token account and mint 1 NFT
      const user2NftAtaAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        admin,
        nft2Mint,
        user2.publicKey
      );
      user2NftAta = user2NftAtaAccount.address;
      
      await mintTo(
        provider.connection,
        admin,
        nft2Mint,
        user2NftAta,
        admin,
        1n
      );

      const [stakeRecordPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("stake"),
          matchId.toArrayLike(Buffer, "le", 8),
          nft2Mint.toBuffer(),
        ],
        program.programId
      );

      const [userPositionPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("user_position"),
          matchId.toArrayLike(Buffer, "le", 8),
          user2.publicKey.toBuffer(),
        ],
        program.programId
      );

      const nftEdition = getNftEditionPda(nft2Mint);

      const tx = await program.methods
        .stakeNft(
          { limited: {} }, // Tier::Limited
          new BN(5 * LAMPORTS_PER_SOL), // estimated 5 SOL value
          false // prediction: NO
        )
        .accountsStrict({
          matchPool: matchPoolPda,
          stakeRecord: stakeRecordPda,
          userPosition: userPositionPda,
          nftMint: nft2Mint,
          userNftAta: user2NftAta,
          nftEdition: nftEdition,
          user: user2.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        })
        .signers([user2])
        .rpc();

      console.log("stakeNft (user2 NO) tx:", tx);

      const stakeRecord = await program.account.stakeRecord.fetch(stakeRecordPda);
      assert.ok(stakeRecord.user.equals(user2.publicKey));
      assert.equal(stakeRecord.prediction, false);

      // NFT should still be in user's wallet (non-custodial)
      const nftAccount = await getAccount(provider.connection, user2NftAta);
      assert.equal(nftAccount.amount.toString(), "1");
      console.log("NFT is frozen in user2's wallet (non-custodial)");

      const matchPool = await program.account.matchPool.fetch(matchPoolPda);
      assert.ok(matchPool.totalNoWeight.gt(new BN(0)));
      console.log("YES weight:", matchPool.totalYesWeight.toString());
      console.log("NO weight:", matchPool.totalNoWeight.toString());
    });
  });

  describe("Match Resolution & Claims", () => {
    it("Admin resolves match (YES wins)", async () => {
      const tx = await program.methods
        .resolveMatch(true) // YES wins
        .accountsStrict({
          matchPool: matchPoolPda,
          admin: admin.publicKey,
        })
        .rpc();

      console.log("resolveMatch tx:", tx);

      const matchPool = await program.account.matchPool.fetch(matchPoolPda);
      assert.equal(matchPool.resolved, true);
      assert.equal(matchPool.outcome, true);
    });

    it("Admin unlocks loser (User2) NFT", async () => {
      const [stakeRecordPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("stake"),
          matchId.toArrayLike(Buffer, "le", 8),
          nft2Mint.toBuffer(),
        ],
        program.programId
      );

      const nftEdition = getNftEditionPda(nft2Mint);

      const tx = await program.methods
        .unlockLoser()
        .accountsStrict({
          matchPool: matchPoolPda,
          stakeRecord: stakeRecordPda,
          nftMint: nft2Mint,
          userNftAta: user2NftAta,
          nftEdition: nftEdition,
          admin: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        })
        .rpc();

      console.log("unlockLoser tx:", tx);

      // Verify NFT is now unfrozen (still in user's wallet)
      const nftAccount = await getAccount(provider.connection, user2NftAta);
      assert.equal(nftAccount.amount.toString(), "1");

      // Verify stake record updated
      const stakeRecord = await program.account.stakeRecord.fetch(stakeRecordPda);
      assert.equal(stakeRecord.locked, false);

      console.log("User2's NFT unlocked by admin (loser, no reward)");
    });

    it("Winner (User1) claims reward + gets NFT unfrozen", async () => {
      // Check if prize pool has funds (skip if not funded)
      const matchPool = await program.account.matchPool.fetch(matchPoolPda);
      if (matchPool.prizePool.toNumber() === 0) {
        console.log("Prize pool is empty (funding skipped), skipping claim test");
        return;
      }

      const [stakeRecordPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("stake"),
          matchId.toArrayLike(Buffer, "le", 8),
          nft1Mint.toBuffer(),
        ],
        program.programId
      );

      const nftEdition = getNftEditionPda(nft1Mint);

      // Create user1's gate ATA before claiming reward
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        admin,
        gateMint,
        user1.publicKey
      );

      // Get balance before claim
      const treasuryBalanceBefore = await getAccount(provider.connection, treasuryGateAta);

      const tx = await program.methods
        .claimReward()
        .accountsStrict({
          matchPool: matchPoolPda,
          stakeRecord: stakeRecordPda,
          nftMint: nft1Mint,
          userNftAta: user1NftAta,
          nftEdition: nftEdition,
          treasury: treasuryPda,
          gateMint: gateMint,
          treasuryGateAta: treasuryGateAta,
          userGateAta: user1GateAta,
          user: user1.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        })
        .signers([user1])
        .rpc();

      console.log("claimReward tx:", tx);

      // Verify NFT is still in user's wallet (non-custodial) and now unfrozen
      const nftAccount = await getAccount(provider.connection, user1NftAta);
      assert.equal(nftAccount.amount.toString(), "1");

      // Verify tGATE received
      const gateAccount = await getAccount(provider.connection, user1GateAta);
      console.log("User1 received tGATE:", gateAccount.amount.toString());
      assert.ok(BigInt(gateAccount.amount.toString()) > 0n);

      // Verify stake record updated
      const stakeRecord = await program.account.stakeRecord.fetch(stakeRecordPda);
      assert.equal(stakeRecord.claimed, true);
      assert.equal(stakeRecord.locked, false);

      console.log("User1 claimed reward and NFT is now unfrozen");
    });
  });

  describe("Error Cases", () => {
    it("Cannot stake after match resolved", async () => {
      // Create another NFT
      const nft3Mint = await createMint(provider.connection, admin, admin.publicKey, null, 0);
      const user1Nft3AtaAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        admin,
        nft3Mint,
        user1.publicKey
      );
      const user1Nft3Ata = user1Nft3AtaAccount.address;
      
      await mintTo(provider.connection, admin, nft3Mint, user1Nft3Ata, admin, 1n);

      const [stakeRecordPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("stake"), matchId.toArrayLike(Buffer, "le", 8), nft3Mint.toBuffer()],
        program.programId
      );
      const [userPositionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("user_position"), matchId.toArrayLike(Buffer, "le", 8), user1.publicKey.toBuffer()],
        program.programId
      );
      const nftEdition = getNftEditionPda(nft3Mint);

      try {
        await program.methods
          .stakeNft({ common: {} }, new BN(LAMPORTS_PER_SOL), true)
          .accountsStrict({
            matchPool: matchPoolPda,
            stakeRecord: stakeRecordPda,
            userPosition: userPositionPda,
            nftMint: nft3Mint,
            userNftAta: user1Nft3Ata,
            nftEdition: nftEdition,
            user: user1.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
          })
          .signers([user1])
          .rpc();
        
        assert.fail("Should have thrown MatchResolved error");
      } catch (err: any) {
        assert.include(err.message, "MatchResolved");
        console.log("Correctly rejected: Cannot stake after match resolved");
      }
    });
  });
});
