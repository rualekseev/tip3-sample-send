import { ProviderRpcClient, Address } from "everscale-inpage-provider";
import {
  EverscaleStandaloneClient,
  SimpleKeystore,
} from "everscale-standalone-client/nodejs";

// DO NOT STORE PRIVATE KEYS IN THE CODE — THIS IS FOR DEMONSTRATION PURPOSES ONLY.
const SecretKey = "0000000000000000000000000000000000000000000000000000000000000000"
const WalletPublicKey = "0000000000000000000000000000000000000000000000000000000000000000";

// MBSR root address
const RootAddr = new Address(
    "0:8305ee8616735691da2d329aa28ec6f81eabe7f0204be48a671cf2be18e0f02b",
  );
const ReceiverAddr = new Address(
    "0:0000000000000000000000000000000000000000000000000000000000000000",
  );

// This is the code of a wallet smart contract.
// https://github.com/broxus/ever-wallet-contract
const EverWalletCode =
  "te6cckEBBgEA/AABFP8A9KQT9LzyyAsBAgEgAgMABNIwAubycdcBAcAA8nqDCNcY7UTQgwfXAdcLP8j4KM8WI88WyfkAA3HXAQHDAJqDB9cBURO68uBk3oBA1wGAINcBgCDXAVQWdfkQ8qj4I7vyeWa++COBBwiggQPoqFIgvLHydAIgghBM7mRsuuMPAcjL/8s/ye1UBAUAmDAC10zQ+kCDBtcBcdcBeNcB10z4AHCAEASqAhSxyMsFUAXPFlAD+gLLaSLQIc8xIddJoIQJuZgzcAHLAFjPFpcwcQHLABLM4skB+wAAPoIQFp4+EbqOEfgAApMg10qXeNcB1AL7AOjRkzLyPOI+zYS/";
const EverWalletAbi = {
  "ABI version": 2,
  version: "2.3",
  header: ["pubkey", "time", "expire"],
  functions: [
    {
      name: "sendTransaction",
      inputs: [
        { name: "dest", type: "address" },
        { name: "value", type: "uint128" },
        { name: "bounce", type: "bool" },
        { name: "flags", type: "uint8" },
        { name: "payload", type: "cell" },
      ],
      outputs: [],
    },
  ],
  events: [],
} as const;

const TokenWalletAbi = {
  "ABI version": 2,
  version: "2.7",
  header: ["pubkey", "time", "expire"],
  functions: [
    {
      name: "transfer",
      inputs: [
        { name: "amount", type: "uint128" },
        { name: "recipient", type: "address" },
        { name: "deployWalletValue", type: "uint128" },
        { name: "remainingGasTo", type: "address" },
        { name: "notify", type: "bool" },
        { name: "payload", type: "cell" },
      ],
      outputs: [],
    },
  ],
  events: [],
} as const;

const TokenRootAbi = {
  "ABI version": 2,
  version: "2.7",
  header: ["pubkey", "time", "expire"],
  functions: [
    {
      name: "walletOf",
      inputs: [
        { name: "answerId", type: "uint32" },
        { name: "walletOwner", type: "address" },
      ],
      outputs: [{ name: "value0", type: "address" }],
    },
  ],
  events: [],
} as const;



const keystore = new SimpleKeystore({
  0: {
    publicKey: WalletPublicKey,
    secretKey: SecretKey,
  },
});

const rpcClient = new ProviderRpcClient({
  provider: EverscaleStandaloneClient.create({
    connection: {
      // msharia chain id = 10000001
      id: 10000001,
      type: "proto",
      data: {
        endpoint: "https://rpc.msharia.io",
      },
    },
    keystore: keystore,
    message: {
      retryCount: 0,
      timeout: 50,
    },
  }),
});

type WalletInfo = {
  address: Address;
  isDeployed: boolean;
  state: Awaited<ReturnType<typeof rpcClient.getFullContractState>>;
  stateInit?: string;
};

async function getWalletInfo(): Promise<WalletInfo> {
  const { boc: data } = await rpcClient.packIntoCell({
    structure: [
      { name: "publicKey", type: "uint256" },
      { name: "timestamp", type: "uint64" },
    ] as const,
    data: {
      publicKey: `0x${WalletPublicKey}`,
      timestamp: 0,
    },
  });

  const { tvc } = await rpcClient.mergeTvc({ data, code: EverWalletCode });
  const walletBocHash = await rpcClient.getBocHash(tvc);
  const address = new Address(`0:${walletBocHash}`);
  const state = await rpcClient.getFullContractState({ address });
  const isDeployed = Boolean(state?.state?.isDeployed);

  return {
    address,
    isDeployed,
    state,
    stateInit: isDeployed ? undefined : tvc,
  };
}

async function sendSelfTransaction(info: WalletInfo) {
  const wallet = new rpcClient.Contract(EverWalletAbi, info.address);
  const { transaction, messageHash, expireAt } = await wallet.methods
    .sendTransaction({
      dest: info.address,
      value: "100000000", // amount in nano MSHA
      bounce: false,
      flags: 3,
      payload: "",
    })
    .sendExternalDelayed({
      publicKey: WalletPublicKey,
      stateInit: info.stateInit,
    });

  console.log("Self-transaction details:", {
    messageHash,
    expireAt,
  });
}

async function buildPayloadCell(content: string): Promise<string> {
  const { boc } = await rpcClient.packIntoCell({
    structure: [{ name: "message", type: "string" }] as const,
    data: { message: content },
  });

  return boc;
}

function createTokenTransferSender(context: WalletInfo) {
  return async function transferTip3Tokens(
    recipient: Address,
    senderTokenWalletAddress: Address,
    amount: string,
    payloadText: string,
  ): Promise<void> {
    const tokenWalletContract = new rpcClient.Contract(
      TokenWalletAbi,
      senderTokenWalletAddress,
    );
    const payloadCell = await buildPayloadCell(payloadText);
    const payload = await tokenWalletContract.methods
      .transfer({
        amount,
        recipient,
        deployWalletValue: "120000000",
        remainingGasTo: context.address,
        notify: true,
        payload: payloadCell,
      })
      .encodeInternal();

    const walletContract = new rpcClient.Contract(
      EverWalletAbi,
      context.address,
    );
    const { messageHash, expireAt } = await walletContract.methods
      .sendTransaction({
        dest: senderTokenWalletAddress,
        value: "200000000",
        bounce: true,
        flags: 3,
        payload,
      })
      .sendExternalDelayed({
        publicKey: WalletPublicKey,
        stateInit: context.stateInit,
      });

    console.log("Token transfer transaction:", {
      messageHash,
      expireAt,
    });
  };
}

async function getTokenWalletAddress(
  rootAddr: Address,
  receiverAddr: Address,
): Promise<Address> {
  const rootContract = new rpcClient.Contract(TokenRootAbi, rootAddr);
  const { value0 } = await rootContract.methods
    .walletOf({
      answerId: 0,
      walletOwner: receiverAddr,
    })
    .call();

  return value0;
}

async function myApp() {
  const walletInfo = await getWalletInfo();
  console.log("Wallet address:", walletInfo.address.toString());
  console.log("Is deployed:", walletInfo.isDeployed);
  // Transfer MSHA Himself
  // await sendSelfTransaction(walletInfo);


  const senderTokenWalletAddress = await getTokenWalletAddress(
    RootAddr,
    walletInfo.address,
  );

  console.log(
    "Sender TIP-3 wallet address:",
    senderTokenWalletAddress.toString(),
  );

  // Transfer MBSR
  const transferTip3Tokens = createTokenTransferSender(walletInfo);
  // await transferTip3Tokens(
  //   ReceiverAddr,
  //   senderTokenWalletAddress,
  //   "1000",
  //   "test_test_test",
  // );
}

myApp().catch(console.error);
