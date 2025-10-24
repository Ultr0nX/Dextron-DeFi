import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAccount } from 'wagmi';
import { Button } from './UI/Button';
import { ArrowDownUp, Zap } from 'lucide-react';

export function SwapInterface({ swapXContract, tokenContract, account }) {
  const { chain } = useAccount();
  const [fromToken, setFromToken] = useState('ETH');
  const [toToken, setToToken] = useState('TOKEN');
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [ethBalance, setEthBalance] = useState('0');
  const [tokenBalance, setTokenBalance] = useState('0');

  // Check if user is on correct network
  const isCorrectNetwork = chain?.id === 11155111; // Sepolia

  // Fetch balances
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
    } catch (error) {
      console.error('Error fetching balances:', error);
    }
  };

  // Estimate output amount
  const estimateOutput = async (inputAmount, inputToken) => {
    if (!inputAmount || !swapXContract || parseFloat(inputAmount) === 0) {
      setToAmount('');
      return;
    }

    try {
      const inputAmountWei = ethers.parseEther(inputAmount);
      
      if (inputToken === 'ETH') {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const ethReserve = await provider.getBalance(swapXContract.target);
        const tokenReserve = await swapXContract.getReserve();
        
        const output = await swapXContract.getOutputAmountFromSwap(
          inputAmountWei,
          ethReserve,
          tokenReserve
        );
        setToAmount(ethers.formatEther(output));
      } else {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const ethReserve = await provider.getBalance(swapXContract.target);
        const tokenReserve = await swapXContract.getReserve();
        
        const output = await swapXContract.getOutputAmountFromSwap(
          inputAmountWei,
          tokenReserve,
          ethReserve
        );
        setToAmount(ethers.formatEther(output));
      }
    } catch (error) {
      console.error('Error estimating output:', error);
      setToAmount('0');
    }
  };

  // Handle swap
  const handleSwap = async () => {
    if (!fromAmount || !toAmount || !swapXContract || !account || parseFloat(fromAmount) === 0) {
      alert('Please enter a valid amount');
      return;
    }
    
    setLoading(true);
    try {
      if (fromToken === 'ETH') {
        // ETH to Token swap
        const minTokens = ethers.parseEther(
          (parseFloat(toAmount) * 0.99).toString() // 1% slippage
        );
        
        const tx = await swapXContract.ethToTokenSwap(minTokens, {
          value: ethers.parseEther(fromAmount)
        });
        
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
          alert('✅ Swap successful!');
          fetchBalances();
          setFromAmount('');
          setToAmount('');
        } else {
          alert('❌ Swap failed!');
        }
      } else {
        // Token to ETH swap
        const tokensToSwap = ethers.parseEther(fromAmount);
        const minEth = ethers.parseEther(
          (parseFloat(toAmount) * 0.99).toString() // 1% slippage
        );

        // First approve tokens
        const approveTx = await tokenContract.approve(
          swapXContract.target,
          tokensToSwap
        );
        await approveTx.wait();
        
        // Then swap
        const swapTx = await swapXContract.tokenToEthSwap(
          tokensToSwap,
          minEth
        );
        const swapReceipt = await swapTx.wait();
        
        if (swapReceipt.status === 1) {
          alert('✅ Swap successful!');
          fetchBalances();
          setFromAmount('');
          setToAmount('');
        } else {
          alert('❌ Swap failed!');
        }
      }
    } catch (error) {
      console.error('Swap failed:', error);
      alert(`❌ Swap failed: ${error.reason || error.message}`);
    }
    setLoading(false);
  };

  const switchTokens = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    const tempAmount = fromAmount;
    setFromAmount(toAmount);
    setToAmount(tempAmount);
  };

  const setMaxAmount = () => {
    if (fromToken === 'ETH') {
      // Leave 0.001 ETH for gas
      const maxEth = Math.max(0, parseFloat(ethBalance) - 0.001);
      setFromAmount(maxEth > 0 ? maxEth.toFixed(6) : '0');
    } else {
      setFromAmount(tokenBalance);
    }
  };

  const handleFromAmountChange = (e) => {
    const value = e.target.value;
    setFromAmount(value);
    estimateOutput(value, fromToken);
  };

  // Update output when input changes
  useEffect(() => {
    if (fromAmount && parseFloat(fromAmount) > 0) {
      estimateOutput(fromAmount, fromToken);
    } else {
      setToAmount('');
    }
  }, [fromAmount, fromToken]);

  // Fetch balances on mount and when contracts change
  useEffect(() => {
    fetchBalances();
  }, [account, swapXContract, tokenContract]);

  if (!isCorrectNetwork) {
    return (
      <div className="glass-effect rounded-2xl p-8 text-center">
        <div className="text-yellow-400 mb-4">
          <Zap size={48} className="mx-auto" />
        </div>
        <h3 className="text-xl font-semibold mb-2">Wrong Network</h3>
        <p className="text-gray-400">Please switch to Sepolia testnet to use Swap</p>
      </div>
    );
  }

  return (
    <div className="glass-effect rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Swap</h2>
      </div>

      {/* From Input */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-medium text-gray-400">From</label>
          <div className="text-xs text-gray-400">
            Balance: {fromToken === 'ETH' ? parseFloat(ethBalance).toFixed(4) : parseFloat(tokenBalance).toFixed(4)}
            <button 
              onClick={setMaxAmount}
              className="ml-2 text-blue-400 hover:text-blue-300"
            >
              Max
            </button>
          </div>
        </div>
        <div className="flex space-x-3">
          <input
            type="number"
            value={fromAmount}
            onChange={handleFromAmountChange}
            placeholder="0.0"
            className="flex-1 bg-gray-700 rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600"
            min="0.000001"
            step="0.000001"
          />
          <select 
            value={fromToken}
            onChange={(e) => setFromToken(e.target.value)}
            className="bg-gray-700 rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600"
          >
            <option value="ETH">ETH</option>
            <option value="TOKEN">TOKEN</option>
          </select>
        </div>
      </div>

      {/* Switch Button */}
      <div className="flex justify-center my-2">
        <button
          onClick={switchTokens}
          className="p-2 bg-gray-700 rounded-full hover:bg-gray-600 transition-colors border border-gray-600"
        >
          <ArrowDownUp size={20} />
        </button>
      </div>

      {/* To Input */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-medium text-gray-400">To</label>
          <div className="text-xs text-gray-400">
            Balance: {toToken === 'ETH' ? parseFloat(ethBalance).toFixed(4) : parseFloat(tokenBalance).toFixed(4)}
          </div>
        </div>
        <div className="flex space-x-3">
          <input
            type="number"
            value={toAmount}
            readOnly
            placeholder="0.0"
            className="flex-1 bg-gray-700 rounded-xl px-4 py-3 text-lg focus:outline-none border border-gray-600"
          />
          <select 
            value={toToken}
            onChange={(e) => setToToken(e.target.value)}
            className="bg-gray-700 rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600"
          >
            <option value="TOKEN">TOKEN</option>
            <option value="ETH">ETH</option>
          </select>
        </div>
      </div>

      {/* Swap Button */}
      <Button
        onClick={handleSwap}
        loading={loading}
        disabled={!fromAmount || !toAmount || parseFloat(fromAmount) === 0 || loading}
      >
        {!fromAmount ? 'Enter an amount' : `Swap ${fromToken} for ${toToken}`}
      </Button>
    </div>
  );
}