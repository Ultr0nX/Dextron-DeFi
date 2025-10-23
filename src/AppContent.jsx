import React, { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { SwapInterface } from './components/SwapInterface';
import { Liquidity } from './components/Liquidity';
import { useContracts } from './hooks/useContracts';

export function AppContent() {
  const { address, isConnected, chain } = useAccount();
  const { swapXContract, tokenContract } = useContracts();
  const [activeTab, setActiveTab] = useState('swap');

  // Check if user is on correct network
  const isCorrectNetwork = chain?.id === 11155111; // Sepolia

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="glass-effect border-b border-white/10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {/* <div className="w-8 h-8 bg-blue-500 rounded-lg"></div> */}
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Dextron
              </h1>
            </div>
            <ConnectButton 
              showBalance={true}
              accountStatus="address"
              chainStatus="icon"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {!isConnected ? (
          <div className="text-center max-w-md mx-auto mt-20">
            <div className="glass-effect rounded-2xl p-8">
              <h2 className="text-2xl font-bold mb-4">Welcome to Dextron</h2>
              <p className="text-gray-400 mb-6">
                Connect your wallet to start trading and providing liquidity
              </p>
              <ConnectButton />
            </div>
          </div>
        ) : !isCorrectNetwork ? (
          <div className="text-center max-w-md mx-auto mt-20">
            <div className="glass-effect rounded-2xl p-8">
              <h2 className="text-2xl font-bold mb-4 text-red-400">Wrong Network</h2>
              <p className="text-gray-400 mb-4">
                Please switch to Sepolia testnet to use SwapX
              </p>
              <ConnectButton />
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            {/* Tab Navigation */}
            <div className="glass-effect rounded-2xl p-2 mb-6">
              <div className="flex space-x-2">
                <button
                  onClick={() => setActiveTab('swap')}
                  className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
                    activeTab === 'swap'
                      ? 'bg-blue-500 text-white shadow-lg'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Swap
                </button>
                <button
                  onClick={() => setActiveTab('liquidity')}
                  className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
                    activeTab === 'liquidity'
                      ? 'bg-blue-500 text-white shadow-lg'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Liquidity
                </button>
              </div>
            </div>

            {/* Content */}
            {activeTab === 'swap' && (
              <SwapInterface
                swapXContract={swapXContract}
                tokenContract={tokenContract}
                account={address}
              />
            )}
            {activeTab === 'liquidity' && (
              <Liquidity
                swapXContract={swapXContract}
                tokenContract={tokenContract}
                account={address}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}