import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAccount } from 'wagmi';
import { SWAPX_ADDRESS, TOKEN_ADDRESS } from '../utils/constants';
import {SWAPX_ABI }from '../abis/SwapX.json';
import {TOKEN_ABI} from '../abis/Token.json';

export function useContracts() {
  const { isConnected } = useAccount();
  const [swapXContract, setSwapXContract] = useState(null);
  const [tokenContract, setTokenContract] = useState(null);

  useEffect(() => {
    if (isConnected && window.ethereum) {
      const initContracts = async () => {
        try {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const signer = await provider.getSigner();

          const swapX = new ethers.Contract(SWAPX_ADDRESS, SWAPX_ABI, signer);
          const token = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, signer);

          setSwapXContract(swapX);
          setTokenContract(token);
        } catch (error) {
          console.error('Error initializing contracts:', error);
        }
      };

      initContracts();
    } else {
      setSwapXContract(null);
      setTokenContract(null);
    }
  }, [isConnected]);

  return { swapXContract, tokenContract };
}