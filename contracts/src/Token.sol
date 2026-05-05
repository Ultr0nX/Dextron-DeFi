// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Token
/// @notice Plain ERC20 used as the trading pair against ETH inside SwapX.
///         Fixed supply of 1,000,000 minted to the deployer at construction time.
///         No mint, no burn, no owner. Once it is out, that is what exists forever.
contract Token is ERC20 {
    uint256 public constant INITIAL_SUPPLY = 1_000_000;

    constructor() ERC20("TOKEN", "TKN") {
        _mint(msg.sender, INITIAL_SUPPLY * 10 ** decimals());
    }
}
