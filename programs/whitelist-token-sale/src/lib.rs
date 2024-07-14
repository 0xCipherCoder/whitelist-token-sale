use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};

declare_id!("HcPYAwb9y87YpJPs3BTgc8yMzD2cqecJmNZnqapmt4fh");

#[program]
pub mod whitelist_token_sale {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        price: u64,
        max_tokens_per_wallet: u64,
        whitelist: Vec<Pubkey>,
    ) -> Result<()> {
        let sale = &mut ctx.accounts.sale;
        sale.authority = ctx.accounts.authority.key();
        sale.token_mint = ctx.accounts.token_mint.key();
        sale.token_vault = ctx.accounts.token_vault.key();
        sale.price = price;
        sale.max_tokens_per_wallet = max_tokens_per_wallet;
        sale.whitelist = whitelist;
        Ok(())
    }

    pub fn buy_tokens(ctx: Context<BuyTokens>, amount: u64) -> Result<()> {
        let sale = &ctx.accounts.sale;

        // Check if buyer is whitelisted
        require!(
            sale.whitelist.contains(&ctx.accounts.buyer.key()),
            ErrorCode::NotWhitelisted
        );

        // Check if amount is within limits
        let buyer_token_account = &ctx.accounts.buyer_token_account;
        let tokens_owned = buyer_token_account.amount;
        require!(
            tokens_owned + amount <= sale.max_tokens_per_wallet,
            ErrorCode::ExceedsMaxTokens
        );

        // Calculate price
        let total_price = sale.price.checked_mul(amount).unwrap();

        // Transfer SOL from buyer to authority
        let cpi_accounts = anchor_lang::system_program::Transfer {
            from: ctx.accounts.buyer.to_account_info(),
            to: ctx.accounts.authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.system_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        anchor_lang::system_program::transfer(cpi_ctx, total_price)?;

        // Transfer tokens from vault to buyer
        let seeds = &[b"sale".as_ref(), &[ctx.bumps.sale]];
        let signer = &[&seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.token_vault.to_account_info(),
            to: ctx.accounts.buyer_token_account.to_account_info(),
            authority: ctx.accounts.sale.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, amount)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 32 + 8 + 8 + 32 * 100,
        seeds = [b"sale"],
        bump
    )]
    pub sale: Account<'info, Sale>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub token_mint: Account<'info, Mint>,
    #[account(mut)]
    pub token_vault: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct BuyTokens<'info> {
    #[account(
        mut,
        seeds = [b"sale"],
        bump,
        has_one = authority,
        has_one = token_vault,
    )]
    pub sale: Account<'info, Sale>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: This is the authority account that receives the payment.
    #[account(mut)]
    pub authority: AccountInfo<'info>,
    #[account(mut)]
    pub token_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub buyer_token_account: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct Sale {
    pub authority: Pubkey,
    pub token_mint: Pubkey,
    pub token_vault: Pubkey,
    pub price: u64,
    pub max_tokens_per_wallet: u64,
    pub whitelist: Vec<Pubkey>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Buyer is not whitelisted")]
    NotWhitelisted,
    #[msg("Purchase exceeds max tokens per wallet")]
    ExceedsMaxTokens,
}