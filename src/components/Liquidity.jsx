import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAccount } from 'wagmi';
import { Button } from './UI/Button';
import { Plus, Minus, PieChart } from 'lucide-react';

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

  // Check if user is on correct network
  const isCorrectNetwork = chain?.id === 11155111; // Sepolia

// Add this debug function
const debugContractState = async () => {
  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    
    // Check contract ETH balance
    const contractETH = await provider.getBalance(swapXContract.target);
    
    // Check token reserve
    const tokenReserve = await swapXContract.getReserve();
    
    // Check if token approval worked
    const tokenAllowance = await tokenContract.allowance(account, swapXContract.target);
    
    console.log('=== CONTRACT DEBUG INFO ===');
    console.log('Contract ETH Balance:', ethers.formatEther(contractETH));
    console.log('Token Reserve:', ethers.formatEther(tokenReserve));
    console.log('Token Allowance:', ethers.formatEther(tokenAllowance));
    console.log('Is pool empty?', contractETH === 0n && tokenReserve === 0n);
    console.log('===========================');
    
    return {
      contractETH: ethers.formatEther(contractETH),
      tokenReserve: ethers.formatEther(tokenReserve),
      tokenAllowance: ethers.formatEther(tokenAllowance),
      isEmpty: contractETH === 0n && tokenReserve === 0n
    };
  } catch (error) {
    console.error('Debug error:', error);
  }
};


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

      // Calculate pool share
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

 // DEBUG VERSION - Test exact contract interaction
const addLiquidity = async () => {
  if (!ethAmount || !tokenAmount) {
    alert('Please enter amounts');
    return;
  }
  
  setLoading(true);
  try {
    // Debug first
    const debugInfo = await debugContractState();
    console.log('Debug info:', debugInfo);
    
    const ethValue = ethers.parseEther(ethAmount);
    const tokenValue = ethers.parseEther(tokenAmount);
    
    console.log('Trying with:', {
      ethAmount,
      tokenAmount,
      ethValue: ethValue.toString(),
      tokenValue: tokenValue.toString()
    });

    // Step 1: Check if we need to approve
    const currentAllowance = await tokenContract.allowance(account, swapXContract.target);
    console.log('Current allowance:', currentAllowance.toString());
    
    if (currentAllowance < tokenValue) {
      console.log('Approving tokens...');
      const approveTx = await tokenContract.approve(swapXContract.target, tokenValue);
      console.log('Approval tx sent:', approveTx.hash);
      await approveTx.wait();
      console.log('Tokens approved');
    } else {
      console.log('Already approved enough tokens');
    }

    // Step 2: Try direct call with error handling
    console.log('Calling addLiquidity...');
    
    // Try with callStatic first to simulate
    try {
      console.log('Simulating transaction...');
      const result = await swapXContract.addLiquidity.staticCall(tokenValue, { 
        value: ethValue 
      });
      console.log('Simulation successful, LP tokens to mint:', result.toString());
    } catch (simError) {
      console.error('Simulation failed:', simError);
      throw new Error(`Transaction would fail: ${simError.reason || simError.message}`);
    }

    // If simulation passes, send real transaction
    console.log('Sending real transaction...');
    const liquidityTx = await swapXContract.addLiquidity(tokenValue, { 
      value: ethValue 
    });
    
    console.log('Transaction sent:', liquidityTx.hash);
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
    console.error('Full error details:', error);
    
    // Try to decode the custom error
    if (error.data) {
      console.log('Raw error data:', error.data);
      
      // Common custom errors in DEX contracts
      const errorMapping = {
        '0xe450d38c': 'InsufficientTokenAmount',
        '0x6d807a03': 'InsufficientLiquidity',
        '0x6ea056a9': 'TransferFailed'
      };
      
      const errorSig = error.data.slice(0, 10);
      console.log('Error signature:', errorSig);
      console.log('Likely error:', errorMapping[errorSig] || 'Unknown custom error');
    }
    
    alert(`❌ Contract error: ${error.reason || error.message}`);
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

  const setMaxETH = () => {
    // Leave 0.001 ETH for gas
    const maxEth = Math.max(0, parseFloat(ethBalance) - 0.001);
    setEthAmount(maxEth > 0 ? maxEth.toFixed(6) : '0');
  };

  const setMaxTokens = () => {
    setTokenAmount(tokenBalance);
  };

  // // Test with predefined values
  // const testWithValues = (eth, tokens) => {
  //   setEthAmount(eth);
  //   setTokenAmount(tokens);
  // };

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
      {/* Quick Test Buttons */}
      {/* <div className="glass-effect rounded-2xl p-4">
        <h3 className="text-lg font-semibold mb-3">Quick Test Values</h3>
        <div className="grid grid-cols-2 gap-2">
          <button 
            onClick={() => testWithValues('0.001', '1.0')}
            className="bg-blue-600 hover:bg-blue-700 py-2 px-3 rounded-lg text-sm"
          >
            0.001 ETH + 1.0 Token
          </button>
          <button 
            onClick={() => testWithValues('0.0005', '0.5')}
            className="bg-blue-600 hover:bg-blue-700 py-2 px-3 rounded-lg text-sm"
          >
            0.0005 ETH + 0.5 Token
          </button>
          <button 
            onClick={() => testWithValues('0.0001', '0.1')}
            className="bg-blue-600 hover:bg-blue-700 py-2 px-3 rounded-lg text-sm"
          >
            0.0001 ETH + 0.1 Token
          </button>
          <button 
            onClick={() => testWithValues('0.00001', '0.01')}
            className="bg-blue-600 hover:bg-blue-700 py-2 px-3 rounded-lg text-sm"
          >
            0.00001 ETH + 0.01 Token
          </button>
        </div>
      </div> */}

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
              <button 
                onClick={setMaxETH}
                className="ml-2 text-blue-400 hover:text-blue-300"
              >
                Max
              </button>
            </div>
          </div>
          <input
            type="number"
            value={ethAmount}
            onChange={(e) => setEthAmount(e.target.value)}
            placeholder="0.0"
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
              <button 
                onClick={setMaxTokens}
                className="ml-2 text-blue-400 hover:text-blue-300"
              >
                Max
              </button>
            </div>
          </div>
          <input
            type="number"
            value={tokenAmount}
            onChange={(e) => setTokenAmount(e.target.value)}
            placeholder="0.0"
            className="w-full bg-gray-700 rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600"
            min="0"
            step="0.000001"
          />
        </div>

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

      {/* Pool Info Section */}
      <div className="glass-effect rounded-2xl p-6 border border-gray-600">
        <h3 className="text-lg font-semibold mb-4">Pool Information</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Total LP Supply:</span>
            <span>{parseFloat(totalLPTokens).toFixed(6)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Your Share:</span>
            <span>{poolShare}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Your LP Tokens:</span>
            <span>{parseFloat(lpTokens).toFixed(6)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}