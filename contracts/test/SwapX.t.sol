// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import {SwapX} from "../src/SwapX.sol";
import {Token} from "../src/Token.sol";

contract SwapXTest is Test {
    SwapX internal swap;
    Token internal token;

    address internal deployer;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal constant INITIAL_TOKEN_SUPPLY = 1_000_000e18;

    function setUp() public {
        deployer = address(this);
        token = new Token();
        swap = new SwapX(address(token));

        // Distribute test tokens.
        token.transfer(alice, 400_000e18);
        token.transfer(bob, 400_000e18);

        // Fund traders with ETH.
        vm.deal(alice, 1000 ether);
        vm.deal(bob, 1000 ether);
    }

    receive() external payable {}

    // -----------------------------------------------------------------------
    // Constructor / metadata
    // -----------------------------------------------------------------------

    function test_Constructor_SetsTokenAddressAndLpMetadata() public view {
        assertEq(swap.tokenAddress(), address(token));
        assertEq(swap.name(), "ULTRON");
        assertEq(swap.symbol(), "ULTRN");
        assertEq(swap.totalSupply(), 0);
    }

    function test_Constructor_RevertsOnZeroToken() public {
        vm.expectRevert(bytes("Invalid token address"));
        new SwapX(address(0));
    }

    function test_GetReserve_StartsAtZero() public view {
        assertEq(swap.getReserve(), 0);
    }

    // -----------------------------------------------------------------------
    // getOutputAmountFromSwap (pure math)
    // -----------------------------------------------------------------------

    function test_OutputFormula_KnownVector() public view {
        // README example: pool 10 ETH / 20,000 TKN, swap 1 ETH.
        // dy = (99 * 1 * 20000) / (100 * 10 + 99 * 1) = 1,980,000 / 1099
        uint256 dx = 1 ether;
        uint256 x = 10 ether;
        uint256 y = 20_000 ether;
        uint256 out = swap.getOutputAmountFromSwap(dx, x, y);
        uint256 expected = (99 * dx * y) / (100 * x + 99 * dx);
        assertEq(out, expected);
    }

    function test_OutputFormula_RevertsOnZeroReserve() public {
        vm.expectRevert(bytes("Reserves must be greater than 0"));
        swap.getOutputAmountFromSwap(1 ether, 0, 1 ether);

        vm.expectRevert(bytes("Reserves must be greater than 0"));
        swap.getOutputAmountFromSwap(1 ether, 1 ether, 0);
    }

    function testFuzz_OutputFormula_NeverExceedsOutputReserve(uint256 dx, uint256 x, uint256 y) public view {
        x = bound(x, 1, 1e30);
        y = bound(y, 1, 1e30);
        dx = bound(dx, 0, 1e30);
        uint256 out = swap.getOutputAmountFromSwap(dx, x, y);
        assertLt(out, y);
    }

    // -----------------------------------------------------------------------
    // addLiquidity
    // -----------------------------------------------------------------------

    function _addInitialLiquidity(address who, uint256 ethAmount, uint256 tokenAmount) internal returns (uint256) {
        vm.startPrank(who);
        token.approve(address(swap), tokenAmount);
        uint256 lp = swap.addLiquidity{value: ethAmount}(tokenAmount);
        vm.stopPrank();
        return lp;
    }

    function test_AddLiquidity_Initial_MintsLpEqualToEth() public {
        uint256 lp = _addInitialLiquidity(alice, 10 ether, 20_000e18);

        assertEq(lp, 10 ether, "first deposit mints lp == eth in wei");
        assertEq(swap.balanceOf(alice), 10 ether);
        assertEq(swap.totalSupply(), 10 ether);
        assertEq(address(swap).balance, 10 ether);
        assertEq(swap.getReserve(), 20_000e18);
    }

    function test_AddLiquidity_Subsequent_PullsRatioAmountAndMintsProportionalLp() public {
        _addInitialLiquidity(alice, 10 ether, 20_000e18);

        uint256 bobTokenBefore = token.balanceOf(bob);
        uint256 totalSupplyBefore = swap.totalSupply();

        // Bob deposits 2 ETH. Required tokens: (2 * 20000) / 10 = 4000 TKN.
        // LP minted: (totalSupply * 2) / 10 = 2.
        vm.startPrank(bob);
        token.approve(address(swap), 10_000e18); // approve more than needed
        uint256 lp = swap.addLiquidity{value: 2 ether}(10_000e18);
        vm.stopPrank();

        assertEq(lp, (totalSupplyBefore * 2 ether) / 10 ether, "lp mint formula");
        assertEq(swap.balanceOf(bob), lp);
        assertEq(token.balanceOf(bob), bobTokenBefore - 4_000e18, "only ratio amount pulled");
        assertEq(swap.getReserve(), 20_000e18 + 4_000e18);
        assertEq(address(swap).balance, 12 ether);
    }

    function test_AddLiquidity_Subsequent_RevertsWhenInsufficientTokensOffered() public {
        _addInitialLiquidity(alice, 10 ether, 20_000e18);

        vm.startPrank(bob);
        token.approve(address(swap), 100e18);
        vm.expectRevert(bytes("Insufficient amount of tokens provided"));
        swap.addLiquidity{value: 2 ether}(100e18); // need 4000, offered only 100
        vm.stopPrank();
    }

    // -----------------------------------------------------------------------
    // removeLiquidity
    // -----------------------------------------------------------------------

    function test_RemoveLiquidity_ReturnsProportionalShare() public {
        _addInitialLiquidity(alice, 10 ether, 20_000e18);

        uint256 lp = swap.balanceOf(alice);
        uint256 ethBefore = alice.balance;
        uint256 tokenBefore = token.balanceOf(alice);

        vm.prank(alice);
        (uint256 ethOut, uint256 tokenOut) = swap.removeLiquidity(lp);

        assertEq(ethOut, 10 ether);
        assertEq(tokenOut, 20_000e18);
        assertEq(swap.balanceOf(alice), 0);
        assertEq(swap.totalSupply(), 0);
        assertEq(alice.balance, ethBefore + 10 ether);
        assertEq(token.balanceOf(alice), tokenBefore + 20_000e18);
    }

    function test_RemoveLiquidity_PartialBurn() public {
        _addInitialLiquidity(alice, 10 ether, 20_000e18);

        uint256 half = swap.balanceOf(alice) / 2;

        vm.prank(alice);
        (uint256 ethOut, uint256 tokenOut) = swap.removeLiquidity(half);

        assertEq(ethOut, 5 ether);
        assertEq(tokenOut, 10_000e18);
        assertEq(swap.balanceOf(alice), half);
        assertEq(address(swap).balance, 5 ether);
        assertEq(swap.getReserve(), 10_000e18);
    }

    function test_RemoveLiquidity_RevertsOnZero() public {
        vm.prank(alice);
        vm.expectRevert(bytes("Amount of tokens to remove must be greater than 0"));
        swap.removeLiquidity(0);
    }

    function test_RemoveLiquidity_DistributesAccruedFees() public {
        // Alice provides all initial liquidity, Bob trades, Alice removes.
        _addInitialLiquidity(alice, 100 ether, 200_000e18);

        // Bob does an ETH->TOKEN swap of 1 ETH.
        vm.prank(bob);
        swap.ethToTokenSwap{value: 1 ether}(0);

        uint256 lp = swap.balanceOf(alice);
        uint256 ethBefore = alice.balance;
        uint256 tokenBefore = token.balanceOf(alice);

        vm.prank(alice);
        (uint256 ethOut, uint256 tokenOut) = swap.removeLiquidity(lp);

        // Alice gets back more ETH than she put in (fee captured).
        assertGt(ethOut, 100 ether);
        // She gets back less token than she put in because Bob took some, but that's offset by ETH gain.
        assertLt(tokenOut, 200_000e18);

        assertEq(alice.balance, ethBefore + ethOut);
        assertEq(token.balanceOf(alice), tokenBefore + tokenOut);
    }

    // -----------------------------------------------------------------------
    // ethToTokenSwap
    // -----------------------------------------------------------------------

    function test_EthToTokenSwap_DeliversQuotedAmount() public {
        _addInitialLiquidity(alice, 10 ether, 20_000e18);

        // Quote on the same reserves snapshot the contract will use.
        uint256 expected = swap.getOutputAmountFromSwap(1 ether, 10 ether, 20_000e18);
        uint256 bobTokenBefore = token.balanceOf(bob);

        vm.prank(bob);
        swap.ethToTokenSwap{value: 1 ether}(expected);

        assertEq(token.balanceOf(bob), bobTokenBefore + expected);
        assertEq(address(swap).balance, 11 ether);
        assertEq(swap.getReserve(), 20_000e18 - expected);
    }

    function test_EthToTokenSwap_RevertsWhenSlippageExceeded() public {
        _addInitialLiquidity(alice, 10 ether, 20_000e18);

        uint256 quote = swap.getOutputAmountFromSwap(1 ether, 10 ether, 20_000e18);

        vm.prank(bob);
        vm.expectRevert(bytes("Tokens received are less than minimum tokens expected"));
        swap.ethToTokenSwap{value: 1 ether}(quote + 1);
    }

    function test_EthToTokenSwap_RevertsOnEmptyPool() public {
        vm.prank(bob);
        vm.expectRevert(bytes("Reserves must be greater than 0"));
        swap.ethToTokenSwap{value: 1 ether}(0);
    }

    // -----------------------------------------------------------------------
    // tokenToEthSwap
    // -----------------------------------------------------------------------

    function test_TokenToEthSwap_DeliversQuotedAmount() public {
        _addInitialLiquidity(alice, 10 ether, 20_000e18);

        uint256 tokensIn = 1_000e18;
        uint256 expected = swap.getOutputAmountFromSwap(tokensIn, 20_000e18, 10 ether);
        uint256 bobEthBefore = bob.balance;

        vm.startPrank(bob);
        token.approve(address(swap), tokensIn);
        swap.tokenToEthSwap(tokensIn, expected);
        vm.stopPrank();

        assertEq(bob.balance, bobEthBefore + expected);
        assertEq(address(swap).balance, 10 ether - expected);
        assertEq(swap.getReserve(), 20_000e18 + tokensIn);
    }

    function test_TokenToEthSwap_RevertsWhenSlippageExceeded() public {
        _addInitialLiquidity(alice, 10 ether, 20_000e18);

        uint256 tokensIn = 1_000e18;
        uint256 quote = swap.getOutputAmountFromSwap(tokensIn, 20_000e18, 10 ether);

        vm.startPrank(bob);
        token.approve(address(swap), tokensIn);
        vm.expectRevert(bytes("ETH received is less than minimum ETH expected"));
        swap.tokenToEthSwap(tokensIn, quote + 1);
        vm.stopPrank();
    }

    function test_TokenToEthSwap_RevertsOnEmptyPool() public {
        vm.startPrank(bob);
        token.approve(address(swap), 1_000e18);
        vm.expectRevert(bytes("Reserves must be greater than 0"));
        swap.tokenToEthSwap(1_000e18, 0);
        vm.stopPrank();
    }

    // -----------------------------------------------------------------------
    // Invariants on swaps
    // -----------------------------------------------------------------------

    function test_Invariant_KGrowsAfterEthToTokenSwap() public {
        _addInitialLiquidity(alice, 10 ether, 20_000e18);

        uint256 kBefore = address(swap).balance * swap.getReserve();

        vm.prank(bob);
        swap.ethToTokenSwap{value: 1 ether}(0);

        uint256 kAfter = address(swap).balance * swap.getReserve();
        assertGt(kAfter, kBefore, "fee should make k strictly grow");
    }

    function test_Invariant_KGrowsAfterTokenToEthSwap() public {
        _addInitialLiquidity(alice, 10 ether, 20_000e18);

        uint256 kBefore = address(swap).balance * swap.getReserve();

        vm.startPrank(bob);
        token.approve(address(swap), 1_000e18);
        swap.tokenToEthSwap(1_000e18, 0);
        vm.stopPrank();

        uint256 kAfter = address(swap).balance * swap.getReserve();
        assertGt(kAfter, kBefore);
    }

    function testFuzz_EthToTokenSwap_OutputBoundedByReserve(uint96 ethIn) public {
        _addInitialLiquidity(alice, 100 ether, 200_000e18);
        ethIn = uint96(bound(ethIn, 1, 50 ether));

        uint256 reserveBefore = swap.getReserve();

        vm.deal(bob, ethIn);
        vm.prank(bob);
        swap.ethToTokenSwap{value: ethIn}(0);

        uint256 reserveAfter = swap.getReserve();
        assertLt(reserveAfter, reserveBefore);
        assertGt(reserveAfter, 0, "pool can never be drained to zero");
    }

    // -----------------------------------------------------------------------
    // LP token behaves like an ERC20
    // -----------------------------------------------------------------------

    function test_LpToken_IsTransferable() public {
        _addInitialLiquidity(alice, 10 ether, 20_000e18);

        uint256 lp = swap.balanceOf(alice);

        vm.prank(alice);
        swap.transfer(bob, lp);

        assertEq(swap.balanceOf(alice), 0);
        assertEq(swap.balanceOf(bob), lp);

        // Bob can now redeem.
        vm.prank(bob);
        (uint256 ethOut, uint256 tokenOut) = swap.removeLiquidity(lp);
        assertEq(ethOut, 10 ether);
        assertEq(tokenOut, 20_000e18);
    }
}
