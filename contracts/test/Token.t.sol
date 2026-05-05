// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import {Token} from "../src/Token.sol";

contract TokenTest is Test {
    Token internal token;

    address internal deployer = address(this);
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        token = new Token();
    }

    function test_Metadata() public view {
        assertEq(token.name(), "TOKEN");
        assertEq(token.symbol(), "TKN");
        assertEq(token.decimals(), 18);
    }

    function test_InitialSupplyMintedToDeployer() public view {
        uint256 expected = 1_000_000 * 1e18;
        assertEq(token.totalSupply(), expected);
        assertEq(token.balanceOf(deployer), expected);
        assertEq(token.INITIAL_SUPPLY(), 1_000_000);
    }

    function test_Transfer() public {
        token.transfer(alice, 500e18);
        assertEq(token.balanceOf(alice), 500e18);
        assertEq(token.balanceOf(deployer), 1_000_000e18 - 500e18);
    }

    function test_Transfer_RevertsOnInsufficientBalance() public {
        vm.prank(alice);
        vm.expectRevert();
        token.transfer(bob, 1);
    }

    function test_ApproveAndTransferFrom() public {
        token.approve(alice, 100e18);
        assertEq(token.allowance(deployer, alice), 100e18);

        vm.prank(alice);
        token.transferFrom(deployer, bob, 60e18);

        assertEq(token.balanceOf(bob), 60e18);
        assertEq(token.allowance(deployer, alice), 40e18);
    }

    function test_TransferFrom_RevertsWithoutAllowance() public {
        vm.prank(alice);
        vm.expectRevert();
        token.transferFrom(deployer, bob, 1);
    }

    function testFuzz_Transfer(uint256 amount) public {
        amount = bound(amount, 0, token.balanceOf(deployer));
        token.transfer(alice, amount);
        assertEq(token.balanceOf(alice), amount);
    }
}
