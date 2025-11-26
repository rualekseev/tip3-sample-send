"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const everscale_inpage_provider_1 = require("everscale-inpage-provider");
const nodejs_1 = require("everscale-standalone-client/nodejs");
// DO NOT STORE PRIVATE KEYS IN THE CODE — THIS IS FOR DEMONSTRATION PURPOSES ONLY.
const SecretKey = "0000000000000000000000000000000000000000000000000000000000000000";
const WalletPublicKey = "0000000000000000000000000000000000000000000000000000000000000000";
// MBSR root address
const RootAddr = new everscale_inpage_provider_1.Address("0:8305ee8616735691da2d329aa28ec6f81eabe7f0204be48a671cf2be18e0f02b");
const ReceiverAddr = new everscale_inpage_provider_1.Address("0:1724337257887bace16fe318d52f3dfeb67ba91ae6f1b40b05849b9094855146");
// This is the code of a wallet smart contract.
// https://github.com/broxus/ever-wallet-contract
const EverWalletCode = "te6cckEBBgEA/AABFP8A9KQT9LzyyAsBAgEgAgMABNIwAubycdcBAcAA8nqDCNcY7UTQgwfXAdcLP8j4KM8WI88WyfkAA3HXAQHDAJqDB9cBURO68uBk3oBA1wGAINcBgCDXAVQWdfkQ8qj4I7vyeWa++COBBwiggQPoqFIgvLHydAIgghBM7mRsuuMPAcjL/8s/ye1UBAUAmDAC10zQ+kCDBtcBcdcBeNcB10z4AHCAEASqAhSxyMsFUAXPFlAD+gLLaSLQIc8xIddJoIQJuZgzcAHLAFjPFpcwcQHLABLM4skB+wAAPoIQFp4+EbqOEfgAApMg10qXeNcB1AL7AOjRkzLyPOI+zYS/";
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
};
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
};
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
};
const keystore = new nodejs_1.SimpleKeystore({
    0: {
        publicKey: WalletPublicKey,
        secretKey: SecretKey,
    },
});
const rpcClient = new everscale_inpage_provider_1.ProviderRpcClient({
    provider: nodejs_1.EverscaleStandaloneClient.create({
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
function getWalletInfo() {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const { boc: data } = yield rpcClient.packIntoCell({
            structure: [
                { name: "publicKey", type: "uint256" },
                { name: "timestamp", type: "uint64" },
            ],
            data: {
                publicKey: `0x${WalletPublicKey}`,
                timestamp: 0,
            },
        });
        const { tvc } = yield rpcClient.mergeTvc({ data, code: EverWalletCode });
        const walletBocHash = yield rpcClient.getBocHash(tvc);
        const address = new everscale_inpage_provider_1.Address(`0:${walletBocHash}`);
        const state = yield rpcClient.getFullContractState({ address });
        const isDeployed = Boolean((_a = state === null || state === void 0 ? void 0 : state.state) === null || _a === void 0 ? void 0 : _a.isDeployed);
        return {
            address,
            isDeployed,
            state,
            stateInit: isDeployed ? undefined : tvc,
        };
    });
}
function sendSelfTransaction(info) {
    return __awaiter(this, void 0, void 0, function* () {
        const wallet = new rpcClient.Contract(EverWalletAbi, info.address);
        const { transaction, messageHash, expireAt } = yield wallet.methods
            .sendTransaction({
            dest: info.address,
            value: "100000000",
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
    });
}
function buildPayloadCell(content) {
    return __awaiter(this, void 0, void 0, function* () {
        const { boc } = yield rpcClient.packIntoCell({
            structure: [{ name: "message", type: "string" }],
            data: { message: content },
        });
        return boc;
    });
}
function createTokenTransferSender(context) {
    return function transferTip3Tokens(recipient, senderTokenWalletAddress, amount, payloadText) {
        return __awaiter(this, void 0, void 0, function* () {
            const tokenWalletContract = new rpcClient.Contract(TokenWalletAbi, senderTokenWalletAddress);
            const payloadCell = yield buildPayloadCell(payloadText);
            const payload = yield tokenWalletContract.methods
                .transfer({
                amount,
                recipient,
                deployWalletValue: "120000000",
                remainingGasTo: context.address,
                notify: true,
                payload: payloadCell,
            })
                .encodeInternal();
            const walletContract = new rpcClient.Contract(EverWalletAbi, context.address);
            const { messageHash, expireAt } = yield walletContract.methods
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
        });
    };
}
function getTokenWalletAddress(rootAddr, receiverAddr) {
    return __awaiter(this, void 0, void 0, function* () {
        const rootContract = new rpcClient.Contract(TokenRootAbi, rootAddr);
        const { value0 } = yield rootContract.methods
            .walletOf({
            answerId: 0,
            walletOwner: receiverAddr,
        })
            .call();
        return value0;
    });
}
function myApp() {
    return __awaiter(this, void 0, void 0, function* () {
        const walletInfo = yield getWalletInfo();
        console.log("Wallet address:", walletInfo.address.toString());
        console.log("Is deployed:", walletInfo.isDeployed);
        // Transfer MSHA Himself
        // await sendSelfTransaction(walletInfo);
        const senderTokenWalletAddress = yield getTokenWalletAddress(RootAddr, walletInfo.address);
        console.log("Sender TIP-3 wallet address:", senderTokenWalletAddress.toString());
        // Transfer MBSR
        const transferTip3Tokens = createTokenTransferSender(walletInfo);
        // await transferTip3Tokens(
        //   ReceiverAddr,
        //   senderTokenWalletAddress,
        //   "1000",
        //   "test_test_test",
        // );
    });
}
myApp().catch(console.error);
