use crate::{account_data::node::Node, instructions::register_node::RegisterNode, program_error::ErrorCode};
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
    pub node_id: Pubkey,
    pub hardware_specs: [u8; 32],
    pub price_per_task: u64,
    pub uptime: u64,
}

pub fn exec(
    ctx: Context<RegisterNode>,
    hardware_specs: [u8; 32],
    price: u64,
    uptime: u64,
) -> Result<()> {
    let node = &mut ctx.accounts.node.load_init()?;
    **node = Node::new(
        ctx.accounts.creator.key(),
        ctx.accounts.mint_account.key(),
        hardware_specs,
        price,
        uptime,
        ctx.bumps.node,
    );

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
                to: ctx.accounts.mint_account.to_account_info(),
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
            mint: ctx.accounts.mint_account.to_account_info(),
        },
    ))?;

    // Initialize the standard mint account data
    initialize_mint2(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            InitializeMint2 {
                mint: ctx.accounts.mint_account.to_account_info(),
            },
        ),
        0,                                 // decimals
        &ctx.accounts.creator.key(),       // mint authority
        Some(&ctx.accounts.creator.key()), // freeze authority
    )?;

    emit_cpi!(NodeRegisterEvent{
        creator: ctx.accounts.creator.key(),
        node_id: ctx.accounts.mint_account.key(),
        hardware_specs,
        price_per_task:price,
        uptime,
    });
    Ok(())
}
