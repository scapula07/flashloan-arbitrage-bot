require('dotenv').config()
const common = require('./utils.js')
const { mainnet: addresses } = require('./addressess');
const IFactory = require('@uniswap/v2-core/build/IUniswapV2Factory.json')
const IPair = require('@uniswap/v2-core/build/IUniswapV2Pair.json')  
const IRouter = require('@uniswap/v2-periphery/build/IUniswapV2Router02.json')
const IERC20 = require('@uniswap/v2-periphery/build/IERC20.json')
const abis = require('./abis');
const Flashloan = require("./contracts/builds/Flashloan.json");


const Web3 = require('web3');
const web3 = new Web3("wss://mainnet.infura.io/ws/v3/85fc7c4c61664a96808975adbb581787")
const { ChainId, Token, TokenAmount, Pair } = require('@uniswap/sdk');
const privateKey ="b764afa9d81c96d410561c08c4f408dcdbdbfb88d18b1ebe1a1e6601b43babe4"

const addrSFactory = "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac"
const addrSRouter ="0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F"

const addrToken0 ="0x6B175474E89094C44Da98b954EedeAC495271d0F"
 const addrToken1 ="0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" 
  

 const token0 = new web3.eth.Contract(IERC20.abi,addrToken0)
 const token1 = new web3.eth.Contract(IERC20.abi,addrToken1)
 

const kyber = new web3.eth.Contract(
  abis.kyber.kyberNetworkProxy,
  addresses.kyber.kyberNetworkProxy
)

const sFactory = new web3.eth.Contract(IFactory.abi,addrSFactory)//sushiswap, same ABIs, sushiswap forked uniswap so, basically same contracts
const sRouter = new web3.eth.Contract(IRouter.abi,addrSRouter)

const DIRECTION = {
  KyberToUniswap: 0,        // -> Buy ETH on Kyber, Sell it on Uniswap 
  UniswapToKyber: 1         // -> But ETH on Uniswap, Sell in on Kyber
}

let RECENT_ETH_PRICE_FROM_BINANCE; // The ETH Price will be continously pulled using the Binance API every time a new block is received
const ONE_WEI = web3.utils.toBN(web3.utils.toWei('1'));

const arbTrade=async()=>{

const updateEthPrice = async () => {
  const results = await kyber
    .methods
    .getExpectedRate(
      '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 
      addresses.tokens.dai, 
      1
    )
    .call();
   return web3.utils.toBN('1').mul(web3.utils.toBN(results.expectedRate)).div(ONE_WEI);
  //return results 
}



const init = async () => {
  const networkId = await web3.eth.net.getId();
  console.log("Chain ID :" ,networkId)


  // const flashloan = new web3.eth.Contract(
  //   Flashloan.abi,
  //   Flashloan.networks[networkId].address
  //  )
}

web3.eth.subscribe('newBlockHeaders')
.on('data', async block => {
  console.log(`New block received. Block # ${block.number}`);
   
  ethPrice = await updateEthPrice();
  const AMOUNT_DAI_WEI = web3.utils.toBN(web3.utils.toWei(ethPrice.toString()));
  console.log( "Amount in DAI_WEI :",AMOUNT_DAI_WEI )

  RECENT_ETH_PRICE_FROM_BINANCE = Math.round(await common.retrieveLatestEthPrice()); // Pull the latest eth price using the Binance API
  
 
  const [dai, weth] = await Promise.all(
    [addresses.tokens.dai, addresses.tokens.weth].map(tokenAddress => (
      Token.fetchData(
        ChainId.MAINNET,
        tokenAddress,
      )
    )));

  //Fetch the contract's addresses for the DAI/WETH pair in Uniswap
  const daiWeth = await Pair.fetchData(
    dai,
    weth
  );

  //console.log( daiWeth )

  // const sPair = new web3.eth.Contract(IPair.abi, (await sFactory.methods.getPair(token0.options.address, token1.options.address).call()) )
  // const     sPair0 = new web3.eth.Contract(IPair.abi, (await sFactory.methods.getPair(addrToken0, addrToken1).call()) )
  // const     sPair1 = new web3.eth.Contract(IPair.abi, (await sFactory.methods.getPair(token0.options.address, token1.options.address).call()) )

 
  const amountsEth = await Promise.all([
    kyber
      .methods
      .getExpectedRate(
        addresses.tokens.dai, 
        '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 
        AMOUNT_DAI_WEI
      ) 
      .call(),
    daiWeth.getOutputAmount(new TokenAmount(dai, AMOUNT_DAI_WEI)),
  ]);

  const ethFromKyber = AMOUNT_DAI_WEI.mul(web3.utils.toBN(amountsEth[0].expectedRate)).div(ONE_WEI);
  const ethFromUniswap = web3.utils.toBN(amountsEth[1][0].raw.toString());

  // console.log("ETH From Kyber :" ,ethFromKyber)
  // console.log("ETH From Uniswap :" , ethFromUniswap )

  const amountsDai = await Promise.all([
    kyber
      .methods
      .getExpectedRate(
        '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 
        addresses.tokens.dai, 
        ethFromUniswap.toString()
      ) 
      .call(),
    daiWeth.getOutputAmount(new TokenAmount(weth, ethFromKyber.toString())),
  ]);
  const daiFromKyber = ethFromUniswap.mul(web3.utils.toBN(amountsDai[0].expectedRate)).div(ONE_WEI);
  const daiFromUniswap = web3.utils.toBN(amountsDai[1][0].raw.toString());
  
  // console.log("DAI From Kyber :" ,daiFromKyber)
  // console.log("DAI From Uniswap :" ,  daiFromUniswap  )


  console.log(`Kyber -> Uniswap. Dai input / output: ${web3.utils.fromWei(AMOUNT_DAI_WEI.toString())} / ${web3.utils.fromWei(daiFromUniswap.toString())}`);
  console.log(`Uniswap -> Kyber. Dai input / output: ${web3.utils.fromWei(AMOUNT_DAI_WEI.toString())} / ${web3.utils.fromWei(daiFromKyber.toString())}`);
  
    
  console.log(`Current ETH Price pulled from the Binance API: ${RECENT_ETH_PRICE_FROM_BINANCE}`);
  //console.log(`AMOUNT_DAI_WEI based on the ETH Price from the Binance API: ${AMOUNT_DAI_WEI}`);
  console.log(`Current ETH Price pulled from Kyber: ${ethPrice}`);

  console.log(`ethFromKyber: ${web3.utils.fromWei(ethFromKyber)}`);
  console.log(`ethFromUniswap: ${web3.utils.fromWei(ethFromUniswap)}`);

  const currentEthPrice = ( ethPrice + RECENT_ETH_PRICE_FROM_BINANCE ) / 2;
  
 
  if(daiFromUniswap.gt(AMOUNT_DAI_WEI)) {
    // Prepare/Define the transaction
    const tx = flashloan.methods.initiateFlashloan(
      addresses.dydx.solo, 
      addresses.tokens.dai, 
      AMOUNT_DAI_WEI,
      DIRECTION.KYBER_TO_UNISWAP
    );

  
  
  const [gasPrice, gasCost] = await Promise.all([
    web3.eth.getGasPrice(),
    tx.estimateGas({from: admin}),
  ]);

  const txCost = web3.utils.toBN(gasCost).mul(web3.utils.toBN(gasPrice)).mul(currentEthPrice);

  // Expected profit for an arbitrage operation by buying in Kyber and selling in Uniswap
  const profit = daiFromUniswap.sub(AMOUNT_DAI_WEI).sub(txCost);

  console.log("Trade Profit :",profit)

  if(profit > 0) {
    console.log('Arb opportunity found Kyber -> Uniswap!');
    console.log(`Expected profit: ${web3.utils.fromWei(profit)} Dai`);
    const data = tx.encodeABI();
    const txData = {
      from: admin,
      to: flashloan.options.address,
      data,
      gas: gasCost,
      gasPrice
    };
    const receipt = await web3.eth.sendTransaction(txData);
    console.log(`Transaction hash: ${receipt.transactionHash}`);
  }
}

      // Uniswap -> Kyber
      if(daiFromKyber.gt(AMOUNT_DAI_WEI)) {
        // Prepare/Define the transaction
        const tx = flashloan.methods.initiateFlashloan(
          addresses.dydx.solo, 
          addresses.tokens.dai, 
          AMOUNT_DAI_WEI,
          DIRECTION.UNISWAP_TO_KYBER
        );
        
        // Estimating gasCost of the above transactions
        const [gasPrice, gasCost] = await Promise.all([
          web3.eth.getGasPrice(),
          tx.estimateGas({from: admin}),
        ]);

        // Calculating the total cost of executing the arbitrage transaction
        const txCost = web3.utils.toBN(gasCost).mul(web3.utils.toBN(gasPrice)).mul(currentEthPrice);

        // Expected profit for an arbitrage operation by buying in Uniswap and selling in Kyber
        const profit = daiFromKyber.sub(AMOUNT_DAI_WEI).sub(txCost);

        if(profit > 0) {
          console.log('Arb opportunity found Uniswap -> Kyber!');
          console.log(`Expected profit: ${web3.utils.fromWei(profit)} Dai`);
          const data = tx.encodeABI();
          const txData = {
            from: admin,
            to: flashloan.options.address,
            data,
            gas: gasCost,
            gasPrice
          };
          const receipt = await web3.eth.sendTransaction(txData);
          console.log(`Transaction hash: ${receipt.transactionHash}`);
        }
      }
      console.log("\n\n");
    })
    .on('error', error => {
      console.log(error);
    });
init()


}


module.exports={arbTrade}
