use anchor_lang::prelude::*;

declare_id!("5L7SHJT5uK59tFyYNzuA7qrGorxyEwcXur4Gi28HhyYh");

#[program]
pub mod alpha_desk {
    use super::*;

    /// 注册一条信号（只存哈希 + 关键字段，保证可追溯）
    pub fn register_signal(
        ctx: Context<RegisterSignal>,
        signal_hash: [u8; 32],
        signal_type: u8,
        direction: i8,
        confidence_bps: u16,
    ) -> Result<()> {
        let rec = &mut ctx.accounts.signal;
        rec.authority = ctx.accounts.authority.key();
        rec.signal_hash = signal_hash;
        rec.signal_type = signal_type;
        rec.direction = direction;
        rec.confidence_bps = confidence_bps;
        rec.followers = 0;
        rec.outcome = 0;
        rec.created_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    /// 用户跟随某信号
    pub fn follow_signal(ctx: Context<FollowSignal>) -> Result<()> {
        let sig = &mut ctx.accounts.signal;
        let f = &mut ctx.accounts.follow;
        f.signal = sig.key();
        f.user = ctx.accounts.user.key();
        f.ts = Clock::get()?.unix_timestamp;
        sig.followers = sig.followers.saturating_add(1);
        Ok(())
    }

    /// 事件结算后写入结果，累积战绩
    pub fn record_outcome(ctx: Context<RecordOutcome>, outcome: i8) -> Result<()> {
        let rec = &mut ctx.accounts.signal;
        require_keys_eq!(rec.authority, ctx.accounts.authority.key());
        rec.outcome = outcome;
        Ok(())
    }
}

#[account]
pub struct SignalRecord {
    pub authority: Pubkey,      // 32
    pub signal_hash: [u8; 32],  // 32
    pub signal_type: u8,        // 1
    pub direction: i8,          // 1
    pub confidence_bps: u16,    // 2
    pub followers: u32,         // 4
    pub outcome: i8,            // 1
    pub created_at: i64,        // 8
}

#[account]
pub struct FollowRecord {
    pub signal: Pubkey, // 32
    pub user: Pubkey,   // 32
    pub ts: i64,        // 8
}

#[derive(Accounts)]
#[instruction(signal_hash: [u8; 32])]
pub struct RegisterSignal<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 1 + 1 + 2 + 4 + 1 + 8,
        seeds = [b"signal", authority.key().as_ref(), signal_hash.as_ref()],
        bump
    )]
    pub signal: Account<'info, SignalRecord>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FollowSignal<'info> {
    #[account(mut)]
    pub signal: Account<'info, SignalRecord>,
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 32 + 8,
        seeds = [b"follow", signal.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub follow: Account<'info, FollowRecord>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordOutcome<'info> {
    #[account(mut)]
    pub signal: Account<'info, SignalRecord>,
    pub authority: Signer<'info>,
}
