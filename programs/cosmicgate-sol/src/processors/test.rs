use anchor_lang::prelude::*;
use crate::{account_data::test::Test, instructions::test_instruct::TestInstruct};
pub fn exec(
    ctx: Context<TestInstruct>,
    count: u64    
) -> Result<()> {
    let test = &mut ctx.accounts.test.load_init()?;    
    **test = Test::new(ctx.accounts.creator.key(), count);
    Ok(())
}
