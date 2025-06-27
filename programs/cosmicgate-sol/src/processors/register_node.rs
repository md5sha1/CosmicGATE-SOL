use crate::{account_data::node::Node, instructions::register_node::RegisterNode};
use anchor_lang::{
    prelude::*,
    system_program::{create_account, CreateAccount},
};
use anchor_spl::{
    token_2022::{
        initialize_mint2,
        spl_token_2022::{extension::ExtensionType, pod::PodMint},
        InitializeMint2,
    },
    token_interface::{non_transferable_mint_initialize, NonTransferableMintInitialize},
};

#[event]
pub struct NodeRegisterEvent {
    pub creator: Pubkey,
    pub node: Pubkey,
    pub soul_nft: Pubkey,
    pub node_seed: Pubkey,
    pub node_id: u64,
    pub cpu: u64,
    pub memory: u64,
    pub storage: u64,
    pub os: u8,
    pub arch: u8,
}

pub fn exec(
    ctx: Context<RegisterNode>,
    node_seed:Pubkey,
    cpu: u64,
    memory: u64,
    storage: u64,
    os: u8,
    arch: u8,    
) -> Result<()> {
    let node = &mut ctx.accounts.node.load_init()?;
    let mut state = ctx.accounts.state.load_mut()?;
    **node = Node::new(
        ctx.accounts.creator.key(),
        ctx.accounts.soul_nft_mint.key(),
        node_seed.key(),
        state.node_count,
        0,
        cpu,
        memory,
        storage,
        os,
        arch,
        0,
        ctx.bumps.node,
    );

    create_soul_nft(&ctx)?;

    emit_cpi!(NodeRegisterEvent {
        creator: ctx.accounts.creator.key(),
        soul_nft: ctx.accounts.soul_nft_mint.key(),
        node: ctx.accounts.node.key(),
        node_seed: node_seed.key(),
        node_id: state.node_count,
        cpu,
        memory,
        storage,
        os,
        arch,        
    });

    state.node_count += 1;
    Ok(())
}

fn create_soul_nft(ctx: &Context<RegisterNode>) -> Result<()> {
    //calcuate mint size
    let mint_size =
        ExtensionType::try_calculate_account_len::<PodMint>(&[ExtensionType::NonTransferable])?;
    //calculate lamport for size of mint account with extension
    let lamports = (Rent::get()?).minimum_balance(mint_size);

    //create new account with space for mint and extension data
    create_account(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            CreateAccount {
                from: ctx.accounts.creator.to_account_info(),
                to: ctx.accounts.soul_nft_mint.to_account_info(),
            },
        ),
        lamports,
        mint_size as u64,
        &ctx.accounts.token_program.key(),
    )?;

    // Initialize the NonTransferable extension
    // This instruction must come before the instruction to initialize the mint data
    non_transferable_mint_initialize(CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        NonTransferableMintInitialize {
            token_program_id: ctx.accounts.token_program.to_account_info(),
            mint: ctx.accounts.soul_nft_mint.to_account_info(),
        },
    ))?;

    // Initialize the standard mint account data
    initialize_mint2(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            InitializeMint2 {
                mint: ctx.accounts.soul_nft_mint.to_account_info(),
            },
        ),
        0,                                 // decimals
        &ctx.accounts.creator.key(),       // mint authority
        Some(&ctx.accounts.creator.key()), // freeze authority
    )?;

    Ok(())
}
