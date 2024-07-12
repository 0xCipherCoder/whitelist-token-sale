import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { WhitelistSale, IDL } from "../target/types/whitelist_sale";
import { 
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount
} from "@solana/spl-token";
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

describe("whitelist_sale", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new anchor.Program(IDL, new anchor.web3.PublicKey("5934bLZcGo282mPdMsESW2ejUzCMTu7u6FDzupjzjgNs"), provider) as Program<WhitelistSale>;

  let tokenMint: PublicKey;
  let tokenVault: PublicKey;
  let saleAccount: PublicKey;
  let buyerTokenAccount: PublicKey;

  const authority = Keypair.generate();
  const buyer = Keypair.generate();

  const price = new anchor.BN(LAMPORTS_PER_SOL); // 1 SOL
  const maxTokensPerWallet = new anchor.BN(10);

  before(async () => {
    // Airdrop SOL to authority and buyer
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(authority.publicKey, 10 * LAMPORTS_PER_SOL),
      "confirmed"
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(buyer.publicKey, 10 * LAMPORTS_PER_SOL),
      "confirmed"
    );

    // Create token mint
    tokenMint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      9
    );

    // Create token vault
    tokenVault = await createAccount(
      provider.connection,
      authority,
      tokenMint,
      authority.publicKey
    );

    // Mint tokens to vault
    await mintTo(
      provider.connection,
      authority,
      tokenMint,
      tokenVault,
      authority.publicKey,
      1_000_000_000 // 1000 tokens
    );

    // Create buyer token account
    buyerTokenAccount = await createAccount(
      provider.connection,
      buyer,
      tokenMint,
      buyer.publicKey
    );

    // Generate sale account
    [saleAccount] = await PublicKey.findProgramAddress(
      [Buffer.from("sale")],
      program.programId
    );
  });

  it("Initializes the sale", async () => {
    await program.methods
      .initialize(price, maxTokensPerWallet, [buyer.publicKey])
      .accounts({
        sale: saleAccount,
        authority: authority.publicKey,
        tokenMint: tokenMint,
        tokenVault: tokenVault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([authority])
      .rpc();

    const saleData = await program.account.sale.fetch(saleAccount);
    assert.ok(saleData.authority.equals(authority.publicKey));
    assert.ok(saleData.tokenMint.equals(tokenMint));
    assert.ok(saleData.tokenVault.equals(tokenVault));
    assert.ok(saleData.price.eq(price));
    assert.ok(saleData.maxTokensPerWallet.eq(maxTokensPerWallet));
    assert.ok(saleData.whitelist[0].equals(buyer.publicKey));
  });

  it("Allows whitelisted buyer to purchase tokens", async () => {
    const amount = new anchor.BN(5);

    const buyerBalanceBefore = await provider.connection.getBalance(buyer.publicKey);
    const authorityBalanceBefore = await provider.connection.getBalance(authority.publicKey);

    await program.methods
      .buyTokens(amount)
      .accounts({
        sale: saleAccount,
        buyer: buyer.publicKey,
        authority: authority.publicKey,
        tokenVault: tokenVault,
        buyerTokenAccount: buyerTokenAccount,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    const buyerBalanceAfter = await provider.connection.getBalance(buyer.publicKey);
    const authorityBalanceAfter = await provider.connection.getBalance(authority.publicKey);
    const buyerTokenBalance = await getAccount(provider.connection, buyerTokenAccount);

    assert.ok(buyerBalanceAfter < buyerBalanceBefore - price.muln(5).toNumber());
    assert.ok(authorityBalanceAfter > authorityBalanceBefore + price.muln(5).toNumber());
    assert.ok(buyerTokenBalance.amount === BigInt(5_000_000_000)); // 5 tokens
  });

  it("Prevents non-whitelisted buyer from purchasing tokens", async () => {
    const nonWhitelistedBuyer = Keypair.generate();
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(nonWhitelistedBuyer.publicKey, 10 * LAMPORTS_PER_SOL),
      "confirmed"
    );

    const nonWhitelistedBuyerTokenAccount = await createAccount(
      provider.connection,
      nonWhitelistedBuyer,
      tokenMint,
      nonWhitelistedBuyer.publicKey
    );

    try {
      await program.methods
        .buyTokens(new anchor.BN(1))
        .accounts({
          sale: saleAccount,
          buyer: nonWhitelistedBuyer.publicKey,
          authority: authority.publicKey,
          tokenVault: tokenVault,
          buyerTokenAccount: nonWhitelistedBuyerTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([nonWhitelistedBuyer])
        .rpc();
      assert.fail("Expected error was not thrown");
    } catch (error: any) {
      assert.include(error.message, "Buyer is not whitelisted");
    }
  });

  it("Prevents buying more than max tokens per wallet", async () => {
    try {
      await program.methods
        .buyTokens(new anchor.BN(6))
        .accounts({
          sale: saleAccount,
          buyer: buyer.publicKey,
          authority: authority.publicKey,
          tokenVault: tokenVault,
          buyerTokenAccount: buyerTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();
      assert.fail("Expected error was not thrown");
    } catch (error: any) {
      assert.include(error.message, "Purchase exceeds max tokens per wallet");
    }
  });
});