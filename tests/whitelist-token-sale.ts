import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { WhitelistTokenSale } from "../target/types/whitelist_token_sale";
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { expect } from "chai";

describe("whitelist-token-sale", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.WhitelistTokenSale as Program<WhitelistTokenSale>;

  let authority: anchor.web3.Keypair;
  let tokenMint: anchor.web3.PublicKey;
  let tokenVault: anchor.web3.PublicKey;
  let salePda: anchor.web3.PublicKey;
  let buyer: anchor.web3.Keypair;
  let buyerTokenAccount: anchor.web3.PublicKey;

  const price = new anchor.BN(1_000_000); // 1 SOL
  const maxTokensPerWallet = new anchor.BN(10);

  before(async () => {
    authority = anchor.web3.Keypair.generate();
    buyer = anchor.web3.Keypair.generate();

    // Airdrop SOL to authority and buyer, and wait for confirmation
    const airdropAuthority = await provider.connection.requestAirdrop(authority.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    const airdropBuyer = await provider.connection.requestAirdrop(buyer.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    
    await provider.connection.confirmTransaction(airdropAuthority);
    await provider.connection.confirmTransaction(airdropBuyer);

    await new Promise(resolve => setTimeout(resolve, 5000));

    tokenMint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      0
    );

    tokenVault = await createAccount(
      provider.connection,
      authority,
      tokenMint,
      authority.publicKey
    );

    await mintTo(
      provider.connection,
      authority,
      tokenMint,
      tokenVault,
      authority,
      1_000_000
    );

    [salePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("sale")],
      program.programId
    );

    const buyerATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      buyer,
      tokenMint,
      buyer.publicKey
    );
    buyerTokenAccount = buyerATA.address;

    // Initialize the sale
    const whitelist = [buyer.publicKey];
    await program.methods
      .initialize(price, maxTokensPerWallet, whitelist)
      .accounts({
        sale: salePda,
        authority: authority.publicKey,
        tokenMint: tokenMint,
        tokenVault: tokenVault,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([authority])
      .rpc();
  });

  it("Initializes the sale correctly", async () => {
    const saleAccount = await program.account.sale.fetch(salePda);

    expect(saleAccount.authority.toString()).to.equal(authority.publicKey.toString());
    expect(saleAccount.tokenMint.toString()).to.equal(tokenMint.toString());
    expect(saleAccount.tokenVault.toString()).to.equal(tokenVault.toString());
    expect(saleAccount.price.toString()).to.equal(price.toString());
    expect(saleAccount.maxTokensPerWallet.toString()).to.equal(maxTokensPerWallet.toString());
    expect(saleAccount.whitelist[0].toString()).to.equal(buyer.publicKey.toString());
  });

  it("Allows a whitelisted buyer to purchase tokens", async () => {
    const amount = new anchor.BN(5);

    const buyerBalanceBefore = await provider.connection.getBalance(buyer.publicKey);
    const buyerTokenBalanceBefore = (await provider.connection.getTokenAccountBalance(buyerTokenAccount)).value.amount;

    await program.methods
      .buyTokens(amount)
      .accounts({
        sale: salePda,
        buyer: buyer.publicKey,
        authority: authority.publicKey,
        tokenVault: tokenVault,
        buyerTokenAccount: buyerTokenAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    const buyerBalanceAfter = await provider.connection.getBalance(buyer.publicKey);
    const buyerTokenBalanceAfter = (await provider.connection.getTokenAccountBalance(buyerTokenAccount)).value.amount;

    expect(buyerBalanceBefore - buyerBalanceAfter).to.be.closeTo(price.toNumber() * amount.toNumber(), 10000);
    expect(Number(buyerTokenBalanceAfter) - Number(buyerTokenBalanceBefore)).to.equal(amount.toNumber());
  });

  it("Prevents non-whitelisted buyers from purchasing tokens", async () => {
    const nonWhitelistedBuyer = anchor.web3.Keypair.generate();
    
    const airdropTx = await provider.connection.requestAirdrop(
      nonWhitelistedBuyer.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropTx);
  
    await new Promise(resolve => setTimeout(resolve, 5000));
  
    const nonWhitelistedBuyerTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      nonWhitelistedBuyer,
      tokenMint,
      nonWhitelistedBuyer.publicKey
    );
  
    const amount = new anchor.BN(5);
  
    try {
      await program.methods
        .buyTokens(amount)
        .accounts({
          sale: salePda,
          buyer: nonWhitelistedBuyer.publicKey,
          authority: authority.publicKey,
          tokenVault: tokenVault,
          buyerTokenAccount: nonWhitelistedBuyerTokenAccount.address,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([nonWhitelistedBuyer])
        .rpc();
      
      expect.fail("The transaction should have failed");
    } catch (error) {
      expect(error.toString()).to.include("Buyer is not whitelisted");
    }
  });

  it("Prevents buyers from exceeding the max tokens per wallet", async () => {
    const amount = maxTokensPerWallet.add(new anchor.BN(1));

    try {
      await program.methods
        .buyTokens(amount)
        .accounts({
          sale: salePda,
          buyer: buyer.publicKey,
          authority: authority.publicKey,
          tokenVault: tokenVault,
          buyerTokenAccount: buyerTokenAccount,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();

      expect.fail("The transaction should have failed");
    } catch (error) {
      expect(error.toString()).to.include("Purchase exceeds max tokens per wallet");
    }
  });
});