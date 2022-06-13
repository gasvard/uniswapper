import { BigNumber, ethers } from 'ethers'
import { AlphaRouter, SwapRoute } from '@uniswap/smart-order-router'
import { CurrencyAmount, TradeType } from '@uniswap/sdk-core'
import type { TransactionRequest } from '@ethersproject/abstract-provider/src.ts/index'
import { WETH, UNI } from './tokens'
import {
  provider,
  signer,
  CHAIN_ID,
  SWAP_ROUTER_ADDRESS,
  SLIPPAGE_TOLERANCE,
  DEADLINE,
} from './config'

const tokenFrom = WETH.token
const tokenFromContract = WETH.contract(provider)
const tokenTo = UNI.token

async function main() {
  if (typeof process.argv[2] == 'undefined')
    throw new Error(`Pass in the amount of ${tokenFrom.symbol} to swap.`)

  const walletAddress = await signer.getAddress()
  const amountIn = ethers.utils.parseUnits(process.argv[2], tokenFrom.decimals)
  const balance = await tokenFromContract.balanceOf(walletAddress)

  if (!(await WETH.walletHas(signer, amountIn)))
    throw new Error(
      `Not enough ${tokenFrom.symbol}. Needs ${amountIn}, but balance is ${balance}.`,
    )

  const router = new AlphaRouter({ chainId: CHAIN_ID, provider })
  const route = await router.route(
    CurrencyAmount.fromRawAmount(tokenFrom, amountIn.toString()),
    tokenTo,
    TradeType.EXACT_INPUT,
    {
      recipient: walletAddress,
      slippageTolerance: SLIPPAGE_TOLERANCE,
      deadline: DEADLINE,
    },
  )

  console.log(
    `Swapping ${amountIn} ${tokenFrom.symbol} for ${route?.quote.toFixed(
      tokenTo.decimals,
    )} ${tokenTo.symbol}.`,
  )

  const allowance: BigNumber = await tokenFromContract.allowance(
    walletAddress,
    SWAP_ROUTER_ADDRESS,
  )

  const buildSwapTransaction = (
    walletAddress: string,
    routerAddress: string,
    route: SwapRoute | null,
  ) => {
    return {
      data: route?.methodParameters?.calldata,
      to: routerAddress,
      value: BigNumber.from(route?.methodParameters?.value),
      from: walletAddress,
      gasPrice: BigNumber.from(route?.gasPriceWei),
      // gasLimit: BigNumber.from(route?.estimatedGasUsed).div(100).mul(115), // Add a 15% buffer on top.
      gasLimit: BigNumber.from('200000'),
    }
  }

  const swapTransaction = buildSwapTransaction(
    walletAddress,
    SWAP_ROUTER_ADDRESS,
    route,
  )

  const attemptSwapTransaction = async (
    signer: ethers.Wallet,
    transaction: TransactionRequest,
  ) => {
    const signerBalance = await signer.getBalance()

    if (!signerBalance.gte(transaction.gasLimit || '0'))
      throw new Error(`Not enough ETH to cover gas: ${transaction.gasLimit}`)

    signer.sendTransaction(transaction).then((tx) => {
      tx.wait().then((receipt) => {
        console.log('Completed swap transaction:', receipt.transactionHash)
      })
    })
  }

  if (allowance.lt(amountIn)) {
    console.log(`Requesting ${tokenFrom.symbol} approval…`)

    const approvalTx = await tokenFromContract
      .connect(signer)
      .approve(
        SWAP_ROUTER_ADDRESS,
        ethers.utils.parseUnits(amountIn.mul(1000).toString(), 18),
      )

    approvalTx.wait(3).then(() => {
      attemptSwapTransaction(signer, swapTransaction)
    })
  } else {
    console.log(
      `Sufficient ${tokenFrom.symbol} allowance, no need for approval.`,
    )
    attemptSwapTransaction(signer, swapTransaction)
  }
}

main()
