# Whitelist Token Sale

This project implements a whitelist-gated token sale using Anchor, a framework for Solana programs. The program allows whitelisted users to purchase tokens at a static price with a limit per wallet address.

## Scope

Develop a program using Native Rust or Anchor to allow users to participate in a whitelist-gated sale for a new token. Ensure the token price remains static and set a purchase limit per wallet.

## Features

1. **Whitelist-Gated Sale**: Allows only whitelisted users to purchase tokens.
2. **Static Token Price**: The token price remains static throughout the sale.
3. **Purchase Limit**: Sets a purchase limit per wallet address.

## Prerequisites

- Rust
- Solana CLI
- Node.js
- Yarn
- Anchor

## Installation

1. **Install Solana CLI**:
    ```sh
    sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
    ```

2. **Install Rust**:
    ```sh
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
    ```

3. **Install Node.js and Yarn**:
    ```sh
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
    nvm install --lts
    npm install --global yarn
    ```

4. **Install Anchor**:
    ```sh
    cargo install --git https://github.com/project-serum/anchor --tag v0.19.0 anchor-cli --locked
    ```

## Setup


1. Clone the repository:
    ```sh
    git@github.com:0xCipherCoder/whitelist-token-sale.git
    cd whitelist-token-sale
    ```

2. Install dependencies:
    ```sh
    npm install
    anchor build
    ```

3. Deploy the programs to Solana Local Tesnet:
    ```sh
    anchor deploy
    ```

## Usage

### Building the Program

1. Build the Solana program:
    ```sh
    anchor build
    ```

2. Deploy the program to your local Solana cluster:
    ```sh
    anchor deploy
    ```

### Running Tests

1. Ensure your local Solana test validator is running:
    ```sh
    solana-test-validator
    ```

2. Run the tests:
    ```sh
    anchor test
    ```
### Test Report 

  ```sh 
anchor test
    Finished release [optimized] target(s) in 0.14s

Found a 'test' script in the Anchor.toml. Running it as a test suite!

Running test suite: "/home/pradip/Cipher/OpenSource/whitelist-token-sale/Anchor.toml"
  whitelist-token-sale
    ✔ Initializes the sale correctly
    ✔ Allows a whitelisted buyer to purchase tokens (413ms)
    ✔ Prevents non-whitelisted buyers from purchasing tokens (1258ms)
    ✔ Prevents buyers from exceeding the max tokens per wallet


  4 passing (5s)
```

