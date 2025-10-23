import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia, mainnet } from 'wagmi/chains';
import { WALLETCONNECT_PROJECT_ID } from './constants';

export const config = getDefaultConfig({
  appName: 'SwapX DEX',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
  chains: [sepolia, mainnet],
  ssr: true,
});