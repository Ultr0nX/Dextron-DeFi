// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title SwapX
/// @notice Constant-product (x*y=k) AMM between native ETH and one ERC20 token.
///         The contract is itself an ERC20 representing pool shares (LP tokens).
/// @dev    1% fee on every swap, taken from the input side and left in the reserves.
contract SwapX is ERC20 {
    address public tokenAddress;

    constructor(address _tokenAddress) ERC20("ULTRON", "ULTRN") {
        require(_tokenAddress != address(0), "Invalid token address");
        tokenAddress = _tokenAddress;
    }

    /// @notice Token reserve currently held by this contract.
    function getReserve() public view returns (uint256) {
        return ERC20(tokenAddress).balanceOf(address(this));
    }

    /// @notice Add ETH and ERC20 to the pool. First depositor sets the price ratio.
    /// @dev    For subsequent deposits, only the matching token amount is pulled.
    function addLiquidity(uint256 amountOfToken) public payable returns (uint256) {
        uint256 tokenReserveBalance = getReserve();
        uint256 ethReserveBalance = address(this).balance;
        uint256 lpTokensToMint;

        ERC20 token = ERC20(tokenAddress);

        if (tokenReserveBalance == 0) {
            token.transferFrom(msg.sender, address(this), amountOfToken);
            lpTokensToMint = ethReserveBalance;
            _mint(msg.sender, lpTokensToMint);
            return lpTokensToMint;
        }

        uint256 ethReserveBeforeFunctionCall = ethReserveBalance - msg.value;
        uint256 minTokenAmountRequired = (msg.value * tokenReserveBalance) / ethReserveBeforeFunctionCall;

        require(amountOfToken >= minTokenAmountRequired, "Insufficient amount of tokens provided");

        token.transferFrom(msg.sender, address(this), minTokenAmountRequired);

        lpTokensToMint = (totalSupply() * msg.value) / ethReserveBeforeFunctionCall;
        _mint(msg.sender, lpTokensToMint);

        return lpTokensToMint;
    }

    /// @notice Burn LP tokens and receive a proportional slice of both reserves.
    function removeLiquidity(uint256 amountOfLPTokens) public returns (uint256, uint256) {
        require(amountOfLPTokens > 0, "Amount of tokens to remove must be greater than 0");

        uint256 ethReserveBalance = address(this).balance;
        uint256 lpTokenTotalSupply = totalSupply();

        uint256 ethToReturn = (ethReserveBalance * amountOfLPTokens) / lpTokenTotalSupply;
        uint256 tokenToReturn = (getReserve() * amountOfLPTokens) / lpTokenTotalSupply;

        _burn(msg.sender, amountOfLPTokens);
        payable(msg.sender).transfer(ethToReturn);
        ERC20(tokenAddress).transfer(msg.sender, tokenToReturn);

        return (ethToReturn, tokenToReturn);
    }

    /// @notice Constant-product output formula with 1% fee on input.
    /// @dev    dy = (99 * dx * y) / (100 * x + 99 * dx)
    function getOutputAmountFromSwap(uint256 inputAmount, uint256 inputReserve, uint256 outputReserve)
        public
        pure
        returns (uint256)
    {
        require(inputReserve > 0 && outputReserve > 0, "Reserves must be greater than 0");

        uint256 inputAmountWithFee = inputAmount * 99;
        uint256 numerator = inputAmountWithFee * outputReserve;
        uint256 denominator = (inputReserve * 100) + inputAmountWithFee;

        return numerator / denominator;
    }

    /// @notice Swap ETH for the pool's ERC20.
    /// @param  minTokensToReceive Slippage guard. Reverts if output < this.
    function ethToTokenSwap(uint256 minTokensToReceive) public payable {
        uint256 tokenReserveBalance = getReserve();
        uint256 tokensToReceive =
            getOutputAmountFromSwap(msg.value, address(this).balance - msg.value, tokenReserveBalance);

        require(tokensToReceive >= minTokensToReceive, "Tokens received are less than minimum tokens expected");

        ERC20(tokenAddress).transfer(msg.sender, tokensToReceive);
    }

    /// @notice Swap the pool's ERC20 for ETH.
    /// @param  minEthToReceive Slippage guard. Reverts if output < this.
    function tokenToEthSwap(uint256 tokensToSwap, uint256 minEthToReceive) public {
        uint256 tokenReserveBalance = getReserve();
        uint256 ethToReceive = getOutputAmountFromSwap(tokensToSwap, tokenReserveBalance, address(this).balance);

        require(ethToReceive >= minEthToReceive, "ETH received is less than minimum ETH expected");

        ERC20(tokenAddress).transferFrom(msg.sender, address(this), tokensToSwap);
        payable(msg.sender).transfer(ethToReceive);
    }
}
