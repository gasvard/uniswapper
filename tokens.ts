import { Token } from '@uniswap/sdk-core'
import { Signer, BigNumber, BigNumberish, Contract, providers } from 'ethers'
import { CHAIN_ID } from './config'

const ERC20_ABI = [
  'function allowance(address, address) external view returns (uint256)',
  'function approve(address, uint) external returns (bool)',
  'function balanceOf(address) external view returns(uint256)',
]

type TokenWithContract = {
  contract: (provider: providers.BaseProvider) => Contract
  walletHas: (signer: Signer, requiredAmount: BigNumberish) => Promise<boolean>
  token: Token
}

const buildERC20TokenWithContract = (
  address: string,
  name: string,
  symbol: string,
  decimals: number,
): TokenWithContract => {
  return {
    contract: (provider) => {
      return new Contract(address, ERC20_ABI, provider)
    },

    walletHas: async (signer, requiredAmount) => {
      const contract = new Contract(address, ERC20_ABI, signer.provider)
      const signerBalance = await contract
        .connect(signer)
        .balanceOf(await signer.getAddress())

      return signerBalance.gte(BigNumber.from(requiredAmount))
    },

    token: new Token(CHAIN_ID, address, decimals, symbol, name),
  }
}

export const UNI = buildERC20TokenWithContract(
  '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
  'Uniswap',
  'UNI',
  18,
)

export const WETH = buildERC20TokenWithContract(
  '0xc778417E063141139Fce010982780140Aa0cD5Ab',
  'Wrapped Ether',
  'WETH',
  18,
)
