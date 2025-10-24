import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAccount } from 'wagmi';
import { Button } from './UI/Button';
import { Plus, PieChart } from 'lucide-react';

export function Liquidity({ swapXContract, tokenContract, account }) {
  const { chain } = useAccount();
  const [ethAmount, setEthAmount] = useState('');
  const [tokenAmount, setTokenAmount] = useState('');
  const [lpTokens, setLpTokens] = useState('0');
  const [loading, setLoading] = useState(false);
  const [ethBalance, setEthBalance] = useState('0');
  const [tokenBalance, setTokenBalance] = useState('0');
  const [totalLPTokens, setTotalLPTokens] = useState('0');
  const [poolShare, setPoolShare] = useState('0');
  const [poolReserves, setPoolReserves] = useState({ eth: 0, tokens: 0 });

  // Check if user is on correct network
  const isCorrectNetwork = chain?.id === 11155111; // Sepolia

  // Fetch balances and pool info
  const fetchBalances = async () => {
    if (!account || !swapXContract || !tokenContract) return;

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      
      // ETH balance
      const ethBal = await provider.getBalance(account);
      setEthBalance(ethers.formatEther(ethBal));

      // Token balance
      const tokenBal = await tokenContract.balanceOf(account);
      setTokenBalance(ethers.formatEther(tokenBal));

      // LP token balance
      const lpBal = await swapXContract.balanceOf(account);
      setLpTokens(ethers.formatEther(lpBal));

      // Total LP supply
      const totalSupply = await swapXContract.totalSupply();
      setTotalLPTokens(ethers.formatEther(totalSupply));

      // Get pool reserves from contract
      const contractETH = await provider.getBalance(swapXContract.target);
      const tokenReserve = await swapXContract.getReserve();
      
      const ethRes = parseFloat(ethers.formatEther(contractETH));
      const tokenRes = parseFloat(ethers.formatEther(tokenReserve));
      
      setPoolReserves({ eth: ethRes, tokens: tokenRes });

      // Calculate pool share percentage
      if (parseFloat(totalSupply) > 0) {
        const share = (parseFloat(ethers.formatEther(lpBal)) / parseFloat(ethers.formatEther(totalSupply))) * 100;
        setPoolShare(share.toFixed(4));
      } else {
        setPoolShare('0');
      }

    } catch (error) {
      console.error('Error fetching balances:', error);
    }
  };

  // Add liquidity function
  const addLiquidity = async () => {
    if (!ethAmount || !tokenAmount) {
      alert('Please enter amounts');
      return;
    }
    
    setLoading(true);
    try {
      const ethValue = ethers.parseEther(ethAmount);
      const tokenValue = ethers.parseEther(tokenAmount);

      // Check if we need to approve tokens
      const currentAllowance = await tokenContract.allowance(account, swapXContract.target);
      
      if (currentAllowance < tokenValue) {
        const approveTx = await tokenContract.approve(swapXContract.target, tokenValue);
        await approveTx.wait();
      }

      const liquidityTx = await swapXContract.addLiquidity(tokenValue, { 
        value: ethValue 
      });
      
      const receipt = await liquidityTx.wait();
      
      if (receipt.status === 1) {
        alert('✅ Liquidity added successfully!');
        setEthAmount('');
        setTokenAmount('');
        fetchBalances();
      } else {
        alert('❌ Transaction failed!');
      }
    } catch (error) {
      console.error('Error adding liquidity:', error);
      alert(`❌ ${error.reason || error.message}`);
    }
    setLoading(false);
  };

  // Remove liquidity
  const removeLiquidity = async () => {
    if (!lpTokens || parseFloat(lpTokens) === 0 || !swapXContract) {
      alert('No liquidity to remove');
      return;
    }
    
    setLoading(true);
    try {
      const lpTokenAmount = ethers.parseEther(lpTokens);
      const tx = await swapXContract.removeLiquidity(lpTokenAmount);
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        alert('✅ Liquidity removed successfully!');
        fetchBalances();
      } else {
        alert('❌ Failed to remove liquidity!');
      }
    } catch (error) {
      console.error('Error removing liquidity:', error);
      alert(`❌ Failed to remove liquidity: ${error.reason || error.message}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBalances();
  }, [account, swapXContract, tokenContract]);

  if (!isCorrectNetwork) {
    return (
      <div className="glass-effect rounded-2xl p-8 text-center">
        <div className="text-yellow-400 mb-4">
          <PieChart size={48} className="mx-auto" />
        </div>
        <h3 className="text-xl font-semibold mb-2">Wrong Network</h3>
        <p className="text-gray-400">Please switch to Sepolia testnet to manage liquidity</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pool Status Section */}
      <div className="glass-effect rounded-2xl p-6 border border-gray-600">
        <h3 className="text-lg font-semibold mb-4">Pool Status</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">ETH Reserve:</span>
            <span>{poolReserves.eth.toFixed(6)} ETH</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Token Reserve:</span>
            <span>{poolReserves.tokens.toFixed(2)} tokens</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Total LP Supply:</span>
            <span>{parseFloat(totalLPTokens).toFixed(6)}</span>
          </div>
          {poolReserves.eth > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-400">Current Ratio:</span>
              <span>1 ETH = {(poolReserves.tokens / poolReserves.eth).toFixed(2)} tokens</span>
            </div>
          )}
        </div>
      </div>

      {/* Add Liquidity Section */}
      <div className="glass-effect rounded-2xl p-6">
        <div className="flex items-center space-x-2 mb-6">
          <Plus className="text-blue-400" size={24} />
          <h2 className="text-2xl font-bold">Add Liquidity</h2>
        </div>

        {/* ETH Input */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium text-gray-400">ETH Amount</label>
            <div className="text-xs text-gray-400">
              Balance: {parseFloat(ethBalance).toFixed(4)}
            </div>
          </div>
          <input
            type="number"
            value={ethAmount}
            onChange={(e) => setEthAmount(e.target.value)}
            placeholder="Enter ETH amount"
            className="w-full bg-gray-700 rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600"
            min="0"
            step="0.000001"
          />
        </div>

        {/* Token Input */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium text-gray-400">TOKEN Amount</label>
            <div className="text-xs text-gray-400">
              Balance: {parseFloat(tokenBalance).toFixed(4)}
            </div>
          </div>
          <input
            type="number"
            value={tokenAmount}
            onChange={(e) => setTokenAmount(e.target.value)}
            placeholder="Enter token amount"
            className="w-full bg-gray-700 rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600"
            min="0"
            step="0.000001"
          />
        </div>

        {/* Ratio Suggestion */}
        {poolReserves.eth > 0 && ethAmount && parseFloat(ethAmount) > 0 && (
          <div className="mb-4 p-3 bg-blue-900 rounded-lg border border-blue-700">
            <div className="text-sm text-blue-300">
              💡 Suggested token amount for {ethAmount} ETH: <strong>{(parseFloat(ethAmount) * (poolReserves.tokens / poolReserves.eth)).toFixed(2)} tokens</strong>
            </div>
            <div className="text-xs text-blue-400 mt-1">
              Based on current pool ratio: 1 ETH = {(poolReserves.tokens / poolReserves.eth).toFixed(2)} tokens
            </div>
          </div>
        )}

        <Button
          onClick={addLiquidity}
          loading={loading}
          disabled={!ethAmount || !tokenAmount || parseFloat(ethAmount) === 0 || loading}
        >
          Add Liquidity
        </Button>
      </div>

      {/* Your Liquidity Section */}
      <div className="glass-effect rounded-2xl p-6">
        <div className="flex items-center space-x-2 mb-6">
          <PieChart className="text-green-400" size={24} />
          <h2 className="text-2xl font-bold">Your Liquidity</h2>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center p-4 bg-gray-700 rounded-xl border border-gray-600">
            <div>
              <div className="text-sm text-gray-400">Your LP Tokens</div>
              <div className="text-xl font-semibold">{parseFloat(lpTokens).toFixed(6)}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-400">Pool Share</div>
              <div className="text-xl font-semibold">{poolShare}%</div>
            </div>
          </div>

          {/* Your Share Breakdown */}
          {poolShare > 0 && (
            <div className="p-3 bg-gray-800 rounded-lg border border-gray-700">
              <div className="text-sm text-gray-400 mb-2">Your share represents:</div>
              <div className="flex justify-between text-sm">
                <span>ETH:</span>
                <span>{(poolReserves.eth * parseFloat(poolShare) / 100).toFixed(6)}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span>Tokens:</span>
                <span>{(poolReserves.tokens * parseFloat(poolShare) / 100).toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="text-sm text-gray-400 p-3 bg-gray-800 rounded-lg border border-gray-700">
            💡 LP tokens represent your share of the liquidity pool. You earn fees proportional to your share.
          </div>

          <Button
            onClick={removeLiquidity}
            loading={loading}
            disabled={!lpTokens || parseFloat(lpTokens) === 0 || loading}
            variant="danger"
          >
            Remove All Liquidity
          </Button>
        </div>
      </div>
    </div>
  );
}