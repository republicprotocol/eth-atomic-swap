import { BN } from "bn.js";

import * as testUtils from "./helper/testUtils";

import { settleOrders } from "./helper/settleOrders";
import { market, TokenCodes } from "./helper/testUtils";

import { ApprovingBrokerArtifact } from "./bindings/approving_broker";
import { BrokerVerifierContract } from "./bindings/broker_verifier";
import { DGXMockArtifact } from "./bindings/d_g_x_mock";
import { DarknodeRegistryArtifact, DarknodeRegistryContract } from "./bindings/darknode_registry";
import { OrderbookArtifact, OrderbookContract } from "./bindings/orderbook";
import { PreciseTokenArtifact, PreciseTokenContract } from "./bindings/precise_token";
import { RenExBalancesArtifact, RenExBalancesContract } from "./bindings/ren_ex_balances";
import { RenExBrokerVerifierArtifact, RenExBrokerVerifierContract } from "./bindings/ren_ex_broker_verifier";
import { RenExSettlementArtifact, RenExSettlementContract } from "./bindings/ren_ex_settlement";
import { RenExTokensArtifact, RenExTokensContract } from "./bindings/ren_ex_tokens";
import { RepublicTokenArtifact, RepublicTokenContract } from "./bindings/republic_token";
import { SettlementRegistryArtifact, SettlementRegistryContract } from "./bindings/settlement_registry";

const DarknodeRegistry = artifacts.require("DarknodeRegistry") as DarknodeRegistryArtifact;
const Orderbook = artifacts.require("Orderbook") as OrderbookArtifact;
const RenExSettlement = artifacts.require("RenExSettlement") as RenExSettlementArtifact;
const RenExBalances = artifacts.require("RenExBalances") as RenExBalancesArtifact;
const RenExTokens = artifacts.require("RenExTokens") as RenExTokensArtifact;
const PreciseToken = artifacts.require("PreciseToken") as PreciseTokenArtifact;
const RepublicToken = artifacts.require("RepublicToken") as RepublicTokenArtifact;
const DGXMock = artifacts.require("DGXMock") as DGXMockArtifact;
const RenExBrokerVerifier = artifacts.require("RenExBrokerVerifier") as RenExBrokerVerifierArtifact;
const SettlementRegistry = artifacts.require("SettlementRegistry") as SettlementRegistryArtifact;
const ApprovingBroker = artifacts.require("ApprovingBroker") as ApprovingBrokerArtifact;

contract("RenEx", function (accounts: string[]) {

    const buyer = accounts[0];
    const seller = accounts[1];
    let details: any[];
    const VPT = 0x3;

    const DGX_REN = market(TokenCodes.DGX, TokenCodes.REN);
    const ETH_REN = market(TokenCodes.ETH, TokenCodes.REN);

    before(async function () {
        const dnr: DarknodeRegistryContract = await DarknodeRegistry.deployed();
        const orderbook: OrderbookContract = await Orderbook.deployed();
        const renExSettlement: RenExSettlementContract = await RenExSettlement.deployed();
        const renExBalances: RenExBalancesContract = await RenExBalances.deployed();
        const renExTokens: RenExTokensContract = await RenExTokens.deployed();

        // PreciseToken
        const preciseToken: PreciseTokenContract = await PreciseToken.new();

        const ren: RepublicTokenContract = await RepublicToken.deployed();
        const tokenAddresses = new Map<TokenCodes, testUtils.BasicERC20>()
            .set(TokenCodes.BTC, testUtils.MockBTC)
            .set(TokenCodes.ETH, testUtils.MockETH)
            .set(TokenCodes.LTC, testUtils.MockBTC)
            .set(TokenCodes.DGX, await DGXMock.deployed())
            .set(TokenCodes.REN, ren)
            .set(VPT, preciseToken);

        // Register LTC
        await renExTokens.registerToken(
            TokenCodes.LTC,
            tokenAddresses.get(TokenCodes.LTC).address,
            new BN(await tokenAddresses.get(TokenCodes.LTC).decimals())
        );

        // Register VPT
        await renExTokens.registerToken(
            VPT, tokenAddresses.get(VPT).address,
            new BN(await tokenAddresses.get(VPT).decimals())
        );

        // Register darknode
        const darknode = accounts[2];
        await ren.transfer(darknode, testUtils.MINIMUM_BOND);
        await ren.approve(dnr.address, testUtils.MINIMUM_BOND, { from: darknode });
        await dnr.register(darknode, testUtils.PUBK("1"), testUtils.MINIMUM_BOND, { from: darknode });
        await testUtils.waitForEpoch(dnr);

        const broker = accounts[3];

        // Register broker
        const renExBrokerVerifier: RenExBrokerVerifierContract =
            await RenExBrokerVerifier.deployed();
        await renExBrokerVerifier.registerBroker(broker);

        details = [buyer, seller, darknode, broker, renExSettlement, renExBalances, tokenAddresses, orderbook];
    });

    it("order 1", async () => {
        const buy = { tokens: DGX_REN, price: 1, volume: 2 /* REN */, minimumVolume: 1 /* REN */ };
        const sell = { tokens: DGX_REN, price: 0.95, volume: 1 /* REN */ };

        (await settleOrders.apply(this, [buy, sell, ...details]))
            .should.deep.equal([0.975 /* DGX */, 1 /* REN */]);
    });

    it("order 2", async () => {
        const buy = { tokens: DGX_REN, price: 1, volume: 1.025641025641 /* REN */ };
        const sell = { tokens: DGX_REN, price: 0.95, volume: 1.025641025641 /* REN */ };

        (await settleOrders.apply(this, [buy, sell, ...details]))
            .should.deep.equal([0.999999999 /* DGX */, 1.025641025641 /* REN */]);
    });

    it("order 3", async () => {
        const buy = { tokens: DGX_REN, price: 0.5, volume: 4 /* REN */ };
        const sell = { tokens: DGX_REN, price: 0.5, volume: 2 /* REN */ };

        (await settleOrders.apply(this, [buy, sell, ...details]))
            .should.deep.equal([1 /* DGX */, 2 /* REN */]);
    });

    it("order 4", async () => {
        const buy = { tokens: DGX_REN, price: 1, volume: 1.9999999999 /* REN */ };
        // More precise than the number of decimals DGX has
        const sell = { tokens: DGX_REN, price: 0.0000000001, volume: 1.9999999999 /* REN */ };

        (await settleOrders.apply(this, [buy, sell, ...details]))
            .should.deep.equal([1 /* DGX */, 1.9999999999 /* REN */]);
    });

    it("order 5", async () => {
        const buy = { tokens: DGX_REN, price: 999.5, volume: 0.002001501126 /* REN */ };
        const sell = { tokens: DGX_REN, price: 999, volume: 0.002001501126 /* REN */ };

        (await settleOrders.apply(this, [buy, sell, ...details]))
            .should.deep.equal([2 /* DGX */, 0.002001501126 /* REN */]);
    });

    it("order 6", async () => {
        const buy = { tokens: ETH_REN, price: 99950000, volume: "2.001e-9" /* REN */ };
        const sell = { tokens: ETH_REN, price: 99950000, volume: "2.001e-9" /* REN */ };

        (await settleOrders.apply(this, [buy, sell, ...details]))
            .should.deep.equal([0.19999995 /* ETH */, 2.001e-9 /* REN */]);
    });

    it("order 7", async () => {
        // Prices are at lowest precision possible, and mid-price is even more
        // precise. If the mid-price is rounded, this test will fail.
        const buy = { tokens: ETH_REN, price: 0.000000000002, volume: 1 /* REN */ };
        const sell = { tokens: ETH_REN, price: 0.000000000001, volume: 1 /* REN */ };

        (await settleOrders.apply(this, [buy, sell, ...details]))
            .should.deep.equal([1.5e-12 /* ETH */, 1 /* REN */]);
    });

    it("atomic swap", async () => {
        const tokens = market(TokenCodes.BTC, TokenCodes.ETH);
        const buy = { settlement: 2, tokens, price: 1, volume: 2 /* DGX */, minimumVolume: 1 /* REN */ };
        const sell = { settlement: 2, tokens, price: 0.95, volume: 1 /* REN */ };

        (await settleOrders.apply(this, [buy, sell, ...details]))
            .should.deep.equal([0.975 /* DGX */, 1 /* REN */]);
    });

    it("atomic fees are paid in ethereum-based token", async () => {
        let tokens = market(TokenCodes.ETH, TokenCodes.LTC);
        let buy = { settlement: 2, tokens, price: 1, volume: 2 /* ETH */, minimumVolume: 1 /* LTC */ };
        let sell = { settlement: 2, tokens, price: 0.95, volume: 1 /* LTC */ };

        (await settleOrders.apply(this, [buy, sell, ...details]))
            .should.deep.equal([0.975 /* ETH */, 1 /* LTC */]);
    });

    context("(negative tests)", async () => {
        const tokens = DGX_REN;

        it("seller volume too low", async () => {
            // Seller volume too low
            let buy: any = { tokens, price: 1, volume: 2 /* DGX */, minimumVolume: 2 /* REN */ };
            let sell: any = { tokens, price: 1, volume: 1 /* REN */ };
            await settleOrders.apply(this, [buy, sell, ...details])
                .should.be.rejectedWith(null, /incompatible orders/);
        });

        it("Buyer volume too low", async () => {
            const buy = { tokens, price: 1, volume: 1 /* DGX */ };
            const sell = { tokens, price: 1, volume: 2 /* REN */, minimumVolume: 2 /* REN */ };
            await settleOrders.apply(this, [buy, sell, ...details])
                .should.be.rejectedWith(null, /incompatible orders/);
        });

        it("Prices don't match", async () => {
            const buy = { tokens, price: 1, volume: 1 /* DGX */ };
            const sell = { tokens, price: 1.05, volume: 1 /* REN */, minimumVolume: 1 /* DGX */ };
            await settleOrders.apply(this, [buy, sell, ...details])
                .should.be.rejectedWith(null, /incompatible orders/);
        });

        it("Invalid tokens (should be DGX/REN, not REN/DGX)", async () => {
            const REN_DGX = market(TokenCodes.REN, TokenCodes.DGX);
            const buy = { tokens: REN_DGX, price: 1, volume: 2 /* DGX */, minimumVolume: 1 /* REN */ };
            const sell = { tokens: REN_DGX, price: 0.95, volume: 1 /* REN */ };
            await settleOrders.apply(this, [buy, sell, ...details])
                .should.be.rejectedWith(null, /incompatible orders/);
        });

        it("Orders opened by the same trader", async () => {
            const buy = { tokens, price: 1, volume: 2 /* DGX */, minimumVolume: 1 /* REN */ };
            const sell = { tokens, price: 0.95, volume: 1 /* REN */, trader: buyer };
            await settleOrders.apply(this, [buy, sell, ...details])
                .should.be.rejectedWith(null, /orders from same trader/);
        });

        it("Unsupported settlement", async () => {
            // Register unrelated settlement layer
            const settlementRegistry: SettlementRegistryContract =
                await SettlementRegistry.deployed();
            const approvingBroker: BrokerVerifierContract = await ApprovingBroker.new();
            await settlementRegistry.registerSettlement(3, approvingBroker.address, approvingBroker.address);

            const buy = { settlement: 3, tokens, price: 1, volume: 2 /* DGX */, minimumVolume: 1 /* REN */ };
            const sell = { settlement: 3, tokens, price: 0.95, volume: 1 /* REN */ };

            await settleOrders.apply(this, [buy, sell, ...details])
                .should.be.rejectedWith(null, /invalid settlement id/);
        });

        it("Token with too many decimals", async () => {
            const ETH_VPT = market(TokenCodes.ETH, VPT);

            const buy = { tokens: ETH_VPT, price: 1e-12, volume: 1e-12 /* VPT */ };
            const sell = { tokens: ETH_VPT, price: 1e-12, volume: 1e-12 /* VPT */ };

            await settleOrders.apply(this, [buy, sell, ...details])
                .should.be.rejectedWith(null, /invalid opcode/);
        });

        it("Atomic swap not involving Ether", async () => {
            const BTC_LTC = market(TokenCodes.BTC, TokenCodes.LTC);
            const buy = { settlement: 2, tokens: BTC_LTC, price: 1, volume: 2 /* BTC */, minimumVolume: 1 /* LTC */ };
            const sell = { settlement: 2, tokens: BTC_LTC, price: 0.95, volume: 1 /* LTC */ };

            await settleOrders.apply(this, [buy, sell, ...details])
                .should.be.rejectedWith(null, /non-eth atomic swaps are not supported/);
        });
    });
});
