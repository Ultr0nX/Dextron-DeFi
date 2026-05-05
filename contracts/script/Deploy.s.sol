// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import {Token} from "../src/Token.sol";
import {SwapX} from "../src/SwapX.sol";

/// @title Deploy
/// @notice Deploys Token and SwapX, then optionally seeds the pool with initial liquidity.
///         Reads optional environment variables:
///           SEED_ETH    - amount of wei to seed (default 0, meaning skip seeding)
///           SEED_TOKENS - amount of token wei to seed alongside SEED_ETH
contract Deploy is Script {
    function run() external returns (Token token, SwapX swap) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        token = new Token();
        swap = new SwapX(address(token));

        uint256 seedEth = vm.envOr("SEED_ETH", uint256(0));
        uint256 seedTokens = vm.envOr("SEED_TOKENS", uint256(0));

        if (seedEth > 0 && seedTokens > 0) {
            token.approve(address(swap), seedTokens);
            swap.addLiquidity{value: seedEth}(seedTokens);
        }

        vm.stopBroadcast();

        console2.log("Deployer:    ", deployer);
        console2.log("Token:       ", address(token));
        console2.log("SwapX (LP):  ", address(swap));
        if (seedEth > 0) {
            console2.log("Seeded ETH:  ", seedEth);
            console2.log("Seeded TKN:  ", seedTokens);
        }
    }
}
