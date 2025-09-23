import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorProvider } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  mintTo,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PublicKey, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction } from "@solana/web3.js";
import { expect } from "chai";
import { GateStakingReward } from "../target/types/gate_staking_reward";

describe("gate-staking-reward", () => {
  // Configure the client to use the local cluster.
  AnchorProvider.env();

  const program = anchor.workspace.gateStakingReward as Program<GateStakingReward>;
  const provider = anchor.getProvider();
  const admin = provider.wallet;

  let gateMint: PublicKey;

  const minter = admin.payer;
  const creator = Keypair.generate();
  const operator = Keypair.generate();
  const treasury = Keypair.generate();

  let minterATA: PublicKey;
  let creatorATA: PublicKey;
  let operatorATA: PublicKey;
  let treasuryATA: PublicKey;

  const taskId = new BN(1);

  const [rewardPool] = PublicKey.findProgramAddressSync([Buffer.from("reward_pool")], program.programId);
  const [orchestratorPDA] = PublicKey.findProgramAddressSync([Buffer.from("orchestrator")], program.programId);
  const [taskPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("task"), taskId.toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  before(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(creator.publicKey, 10 * LAMPORTS_PER_SOL)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(operator.publicKey, 10 * LAMPORTS_PER_SOL)
    );

    gateMint = await createMint(provider.connection, minter, minter.publicKey, minter.publicKey, 6);

    minterATA = (await getOrCreateAssociatedTokenAccount(provider.connection, minter, gateMint, minter.publicKey))
      .address;
    creatorATA = getAssociatedTokenAddressSync(gateMint, creator.publicKey);
    operatorATA = getAssociatedTokenAddressSync(gateMint, operator.publicKey);
    treasuryATA = getAssociatedTokenAddressSync(gateMint, treasury.publicKey);

    await mintTo(provider.connection, minter, gateMint, minterATA, minter, 1e11);

    await program.methods
      .initialize()
      .accountsPartial({
        admin: admin.publicKey,
        orchestrator: orchestratorPDA,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([admin.payer])
      .rpc();
  });

  it("Charge reward", async () => {
    const rpoolATA = getAssociatedTokenAddressSync(gateMint, rewardPool, true);

    const mintAmount = new BN(1e10);
    await program.methods
      .chargeReward(mintAmount)
      .accountsPartial({
        charger: minter.publicKey,
        gateMint,
        rewardPool,
        rpoolTokenAccount: rpoolATA,
        chargerTokenAccount: minterATA,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([minter])
      .rpc();

    const rpool = await program.account.rewardPool.fetch(rewardPool);
    expect(rpool.amount.toString()).to.be.equal(mintAmount.toString());
    const rpoolBalance = await getAccount(provider.connection, rpoolATA);
    expect(rpoolBalance.amount.toString()).to.be.equal(mintAmount.toString());
  });

  it("Create task", async () => {
    const rpoolATA = getAssociatedTokenAddressSync(gateMint, rewardPool, true);

    const [creatorPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("creator"), creator.publicKey.toBuffer()],
      program.programId
    );

    const ix = await program.methods
      .createTaskReward(taskId)
      .accountsPartial({
        creatorInfo: creator.publicKey,
        orchestrator: orchestratorPDA,
        creator: creatorPDA,
        task: taskPDA,
        gateMint,
        rewardPool,
        rpoolTokenAccount: rpoolATA,
        userTokenAccount: creatorATA,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .instruction();

    let tx = new Transaction().add(ix);
    tx.partialSign(admin.payer);

    const backendProvider = new anchor.AnchorProvider(provider.connection, admin.payer, {
      commitment: "confirmed",
    });
    const backend = Keypair.generate();
    tx = await new anchor.Wallet(backend).signTransaction(tx);
    const txSig = await backendProvider.connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    const latestBlockhash = await backendProvider.connection.getLatestBlockhash();
    await backendProvider.connection.confirmTransaction(
      {
        signature: txSig,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      "confirmed"
    );
    const txHash = await backendProvider.sendAndConfirm(tx);
    console.log("Transaction hash:", txHash);

    const task = await program.account.task.fetch(taskPDA);
    expect(task.completed).to.be.equal(false);
    expect(task.creator.toString()).to.be.equal(creator.publicKey.toString());

    const creatorBalance = await getAccount(provider.connection, creatorATA);
    expect(creatorBalance.amount.toString()).to.be.equal(new BN(1e6).toString());
  });

  it("Submit task", async () => {
    const [nodePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("node"), operator.publicKey.toBuffer()],
      program.programId
    );
    const rpoolATA = getAssociatedTokenAddressSync(gateMint, rewardPool, true);

    await program.methods
      .submitTaskReward(taskId)
      .accountsPartial({
        operator: operator.publicKey,
        orchestrator: orchestratorPDA,
        node: nodePDA,
        task: taskPDA,
        gateMint,
        rewardPool,
        rpoolTokenAccount: rpoolATA,
        userTokenAccount: operatorATA,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([operator])
      .rpc();

    const task = await program.account.task.fetch(taskPDA);
    expect(task.completed).to.be.equal(true);
    expect(task.operator.toString()).to.be.equal(operator.publicKey.toString());

    const operatorBalance = await getAccount(provider.connection, operatorATA);
    expect(operatorBalance.amount.toString()).to.be.equal(new BN(1.1e6).toString());

    const rpool = await program.account.rewardPool.fetch(rewardPool);
    expect(rpool.amount.toString()).to.be.equal(new BN(1e10 - 2.1e6).toString());

    const rpoolBalance = await getAccount(provider.connection, rpoolATA);
    expect(rpoolBalance.amount.toString()).to.be.equal(new BN(1e10 - 2.1e6).toString());
  });

  it("Stake", async () => {
    const [stakePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake"), operator.publicKey.toBuffer()],
      program.programId
    );
    const stakeATA = getAssociatedTokenAddressSync(gateMint, stakePDA, true);

    const stakeAmount = new BN(100000000);
    await mintTo(provider.connection, minter, gateMint, operatorATA, minter, stakeAmount.toNumber());

    await program.methods
      .stake(stakeAmount, new BN(30))
      .accountsPartial({
        operator: operator.publicKey,
        orchestrator: orchestratorPDA,
        stake: stakePDA,
        gateMint,
        stakeTokenAccount: stakeATA,
        userTokenAccount: operatorATA,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([operator])
      .rpc();

    const stake = await program.account.stake.fetch(stakePDA);
    expect(stake.amount.toString()).to.be.equal(stakeAmount.toString());
    expect(stake.active).to.be.equal(true);

    const stakeBalance = await getAccount(provider.connection, stakeATA);
    expect(stakeBalance.amount.toString()).to.be.equal(stakeAmount.toString());
  });

  it("Unstake", async () => {
    const [stakePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake"), operator.publicKey.toBuffer()],
      program.programId
    );
    const stakeATA = getAssociatedTokenAddressSync(gateMint, stakePDA, true);

    const unstakeAmount = new BN(10000000);

    try {
      await program.methods
        .unstake(unstakeAmount)
        .accountsPartial({
          operator: operator.publicKey,
          orchestrator: orchestratorPDA,
          stake: stakePDA,
          gateMint,
          stakeTokenAccount: stakeATA,
          userTokenAccount: operatorATA,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([operator])
        .rpc();
    } catch (e) {
      expect(e.message).to.includes("still locked");
    }
  });

  it("Slash", async () => {
    const [stakePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake"), operator.publicKey.toBuffer()],
      program.programId
    );
    const stakeATA = getAssociatedTokenAddressSync(gateMint, stakePDA, true);

    let stake = await program.account.stake.fetch(stakePDA);
    const amount = stake.amount;

    await program.methods
      .slash()
      .accountsPartial({
        admin: admin.publicKey,
        orchestrator: orchestratorPDA,
        operator: operator.publicKey,
        stake: stakePDA,
        gateMint,
        stakeTokenAccount: stakeATA,
        treasury: treasury.publicKey,
        treasuryTokenAccount: treasuryATA,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([admin.payer])
      .rpc();

    stake = await program.account.stake.fetch(stakePDA);
    expect(stake.amount.toString()).to.be.equal(amount.sub(amount.div(new BN(10))).toString());
  });
});
