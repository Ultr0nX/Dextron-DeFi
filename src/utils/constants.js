export const SWAPX_ADDRESS = import.meta.env.VITE_SWAPX_ADDRESS;
export const TOKEN_ADDRESS = import.meta.env.VITE_TOKEN_ADDRESS;

// Get from https://cloud.walletconnect.com/
export const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

export const SUPPORTED_CHAINS = {
  sepolia: {
    id: 11155111,
    name: "Sepolia",
    rpcUrl: "https://eth-sepolia.g.alchemy.com/v2/zMK1NP_wwEkwlYF4o3LFn"
  }
};