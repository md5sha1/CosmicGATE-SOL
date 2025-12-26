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
import { Keypair, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

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
  const matchId = new BN(1);

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

  before(async () => {
    // Create test users
    user1 = Keypair.generate();
    user2 = Keypair.generate();

    // Airdrop SOL to users
    const airdropAmount = 2 * LAMPORTS_PER_SOL;
    
    const sig1 = await provider.connection.requestAirdrop(user1.publicKey, airdropAmount);
    const sig2 = await provider.connection.requestAirdrop(user2.publicKey, airdropAmount);
    
    await provider.connection.confirmTransaction(sig1);
    await provider.connection.confirmTransaction(sig2);

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

    // Create admin's gate token account and mint tokens
    adminGateAta = getAssociatedTokenAddressSync(gateMint, admin.publicKey);
    treasuryGateAta = getAssociatedTokenAddressSync(gateMint, treasuryPda, true);

    // Create user gate ATAs
    user1GateAta = getAssociatedTokenAddressSync(gateMint, user1.publicKey);
    user2GateAta = getAssociatedTokenAddressSync(gateMint, user2.publicKey);
  });

  describe("Treasury & Match Setup", () => {
    it("Initialize treasury", async () => {
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

      const treasury = await program.account.treasury.fetch(treasuryPda);
      assert.ok(treasury.admin.equals(admin.publicKey));
      assert.ok(treasury.gateMint.equals(gateMint));
    });

    it("Initialize match pool", async () => {
      const tx = await program.methods
        .initMatchPool(matchId, 3)
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
      assert.equal(matchPool.prizePool.toNumber(), 0);
    });

    it("Fund match pool with tGATE", async () => {
      // First mint tGATE to admin
      const prizeAmount = new BN(1000_000_000_000); // 1000 tGATE

      // Create admin ATA if needed
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        admin,
        gateMint,
        admin.publicKey
      );

      // Mint tGATE to admin
      await mintTo(
        provider.connection,
        admin,
        gateMint,
        adminGateAta,
        admin,
        BigInt(prizeAmount.toString())
      );

      const tx = await program.methods
        .fundMatchPool(prizeAmount)
        .accountsStrict({
          matchPool: matchPoolPda,
          treasury: treasuryPda,
          gateMint: gateMint,
          treasuryGateAta: treasuryGateAta,
          admin: admin.publicKey,
          adminGateAta: adminGateAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log("fundMatchPool tx:", tx);

      const matchPool = await program.account.matchPool.fetch(matchPoolPda);
      assert.ok(matchPool.prizePool.eq(prizeAmount));

      const treasuryBalance = await getAccount(provider.connection, treasuryGateAta);
      assert.equal(treasuryBalance.amount.toString(), prizeAmount.toString());
    });
  });

  describe("NFT Staking", () => {
    it("User1 stakes NFT with YES prediction", async () => {
      // Create user1's NFT token account and mint 1 NFT
      const user1NftAtaAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        admin,
        nft1Mint,
        user1.publicKey
      );
      const user1NftAta = user1NftAtaAccount.address;
      
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

      // Escrow ATA for NFT
      const escrowNftAta = getAssociatedTokenAddressSync(nft1Mint, stakeRecordPda, true);

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
          escrowNftAta: escrowNftAta,
          user: user1.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([user1])
        .rpc();

      console.log("stakeNft (user1 YES) tx:", tx);

      const stakeRecord = await program.account.stakeRecord.fetch(stakeRecordPda);
      assert.ok(stakeRecord.user.equals(user1.publicKey));
      assert.equal(stakeRecord.prediction, true);
      assert.equal(stakeRecord.locked, true);

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
      const user2NftAta = user2NftAtaAccount.address;
      
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

      const escrowNftAta = getAssociatedTokenAddressSync(nft2Mint, stakeRecordPda, true);

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
          escrowNftAta: escrowNftAta,
          user: user2.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([user2])
        .rpc();

      console.log("stakeNft (user2 NO) tx:", tx);

      const stakeRecord = await program.account.stakeRecord.fetch(stakeRecordPda);
      assert.ok(stakeRecord.user.equals(user2.publicKey));
      assert.equal(stakeRecord.prediction, false);

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

    it("Winner (User1) claims reward + gets NFT back", async () => {
      const [stakeRecordPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("stake"),
          matchId.toArrayLike(Buffer, "le", 8),
          nft1Mint.toBuffer(),
        ],
        program.programId
      );

      const user1NftAta = getAssociatedTokenAddressSync(nft1Mint, user1.publicKey);
      const escrowNftAta = getAssociatedTokenAddressSync(nft1Mint, stakeRecordPda, true);

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
          escrowNftAta: escrowNftAta,
          treasury: treasuryPda,
          gateMint: gateMint,
          treasuryGateAta: treasuryGateAta,
          userGateAta: user1GateAta,
          user: user1.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user1])
        .rpc();

      console.log("claimReward tx:", tx);

      // Verify NFT returned
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
    });

    it("Loser (User2) unstakes NFT (no reward)", async () => {
      const [stakeRecordPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("stake"),
          matchId.toArrayLike(Buffer, "le", 8),
          nft2Mint.toBuffer(),
        ],
        program.programId
      );

      const user2NftAta = getAssociatedTokenAddressSync(nft2Mint, user2.publicKey);
      const escrowNftAta = getAssociatedTokenAddressSync(nft2Mint, stakeRecordPda, true);

      const tx = await program.methods
        .unstakeLoser()
        .accountsStrict({
          matchPool: matchPoolPda,
          stakeRecord: stakeRecordPda,
          nftMint: nft2Mint,
          userNftAta: user2NftAta,
          escrowNftAta: escrowNftAta,
          user: user2.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user2])
        .rpc();

      console.log("unstakeLoser tx:", tx);

      // Verify NFT returned
      const nftAccount = await getAccount(provider.connection, user2NftAta);
      assert.equal(nftAccount.amount.toString(), "1");

      // Verify stake record updated
      const stakeRecord = await program.account.stakeRecord.fetch(stakeRecordPda);
      assert.equal(stakeRecord.locked, false);

      console.log("User2 got NFT back but no reward (loser)");
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
      const escrowNftAta = getAssociatedTokenAddressSync(nft3Mint, stakeRecordPda, true);

      try {
        await program.methods
          .stakeNft({ common: {} }, new BN(LAMPORTS_PER_SOL), true)
          .accountsStrict({
            matchPool: matchPoolPda,
            stakeRecord: stakeRecordPda,
            userPosition: userPositionPda,
            nftMint: nft3Mint,
            userNftAta: user1Nft3Ata,
            escrowNftAta: escrowNftAta,
            user: user1.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
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
