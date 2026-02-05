'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { Button } from '@/components/button';
import { Card, CardHeader, CardContent } from '@/components/card';
import { getPrograms, createPipeline, type Program } from '@/lib/api';

type Step = 'programs' | 'filter' | 'transform' | 'destinations';

// Events per program
const PROGRAM_EVENTS: Record<string, string[]> = {
  'PUMP_BONDING_CURVE': [
    'TradeEvent',
    'CreateEvent',
    'CompleteEvent',
    'CompletePumpAmmMigrationEvent',
    'SetCreatorEvent',
    'CollectCreatorFeeEvent',
    'SetMetaplexCreatorEvent',
    'SetParamsEvent',
  ],
  'PUMPSWAP': [
    'BuyEvent',
    'SellEvent',
    'CreatePoolEvent',
    'DepositEvent',
    'WithdrawEvent',
    'CollectCoinCreatorFeeEvent',
    'SetBondingCurveCoinCreatorEvent',
    'SetMetaplexCoinCreatorEvent',
  ],
  'METEORA_DBC': [
    'EvtSwap2',
    'EvtInitializePool',
    'EvtCurveComplete',
    'EvtClaimTradingFee',
    'EvtClaimCreatorTradingFee',
    'EvtCreatorWithdrawSurplus',
    'EvtVirtualPoolMetadata',
    'EvtCreateMeteoraMigrationMetadata',
  ],
  'METEORA_DAMM_V1': [
    'Swap',
    'AddLiquidity',
    'RemoveLiquidity',
    'BootstrapLiquidity',
  ],
  'METEORA_DAMM_V2': [
    'EvtSwap2',
    'EvtInitializePool',
    'EvtCreatePosition',
    'EvtClosePosition',
    'EvtLiquidityChange',
    'EvtClaimPositionFee',
    'EvtClaimReward',
    'EvtLockPosition',
  ],
  'METEORA_DLMM': [
    'Swap',
    'AddLiquidity',
    'RemoveLiquidity',
    'ClaimFee',
    'ClaimReward',
    'PositionCreate',
    'PositionClose',
    'LbPairCreate',
    'CompositionFee',
  ],
};

// High volume events that will likely exceed Discord/Telegram rate limits
const HIGH_VOLUME_EVENTS: Record<string, { events: string[]; estimatedVolume: string }> = {
  'PUMP_BONDING_CURVE': { events: ['TradeEvent'], estimatedVolume: '500-2000/min' },
  'PUMPSWAP': { events: ['BuyEvent', 'SellEvent'], estimatedVolume: '300-1500/min' },
  'METEORA_DBC': { events: ['EvtSwap2'], estimatedVolume: '200-800/min' },
  'METEORA_DAMM_V1': { events: ['Swap'], estimatedVolume: '200-800/min' },
  'METEORA_DAMM_V2': { events: ['EvtSwap2'], estimatedVolume: '200-800/min' },
  'METEORA_DLMM': { events: ['Swap'], estimatedVolume: '200-800/min' },
};

// Field definitions for each event type
interface FieldDef {
  name: string;
  path: string;
  description: string;
  category: 'identity' | 'trade' | 'amounts' | 'accounts' | 'metadata';
  pipe?: string;
}

// Common fields available on all events
const COMMON_FIELDS: FieldDef[] = [
  { name: 'signature', path: 'signature', description: 'Transaction signature', category: 'identity' },
  { name: 'slot', path: 'slot', description: 'Block slot number', category: 'identity' },
  { name: 'timestamp', path: 'blockTime', description: 'Block timestamp', category: 'identity', pipe: 'timestamp' },
  { name: 'feePayer', path: 'signer', description: 'Wallet that paid for the transaction', category: 'accounts' },
  { name: 'program', path: 'program', description: 'Program ID', category: 'identity' },
  { name: 'eventName', path: 'name', description: 'Event type name', category: 'identity' },
];

// Event-specific fields
const EVENT_FIELDS: Record<string, FieldDef[]> = {
  // Pump.fun Bonding Curve - TradeEvent (field names from IDL are snake_case)
  'TradeEvent': [
    { name: 'mint', path: 'data.mint', description: 'Token mint address', category: 'accounts' },
    { name: 'solAmount', path: 'data.sol_amount', description: 'SOL amount traded', category: 'amounts', pipe: 'lamportsToSol' },
    { name: 'tokenAmount', path: 'data.token_amount', description: 'Token amount traded', category: 'amounts' },
    { name: 'isBuy', path: 'data.is_buy', description: 'Buy (true) or Sell (false)', category: 'trade' },
    { name: 'wallet', path: 'data.user', description: 'Wallet that performed the swap', category: 'accounts' },
    { name: 'bondingCurveProgress', path: 'data.real_token_reserves', description: 'Bonding curve completion (0-100%)', category: 'trade', pipe: 'bondingCurveProgress' },
    { name: 'fee', path: 'data.fee', description: 'Transaction fee', category: 'amounts', pipe: 'lamportsToSol' },
    { name: 'creatorFee', path: 'data.creator_fee', description: 'Creator fee from trade', category: 'amounts', pipe: 'lamportsToSol' },
  ],
  // Pump.fun Bonding Curve - CreateEvent (IDL uses snake_case)
  'CreateEvent': [
    { name: 'mint', path: 'data.mint', description: 'Token mint address', category: 'accounts' },
    { name: 'tokenName', path: 'data.name', description: 'Token name', category: 'metadata' },
    { name: 'symbol', path: 'data.symbol', description: 'Token symbol', category: 'metadata' },
    { name: 'uri', path: 'data.uri', description: 'Metadata URI', category: 'metadata' },
    { name: 'bondingCurve', path: 'data.bonding_curve', description: 'Bonding curve address', category: 'accounts' },
    { name: 'creator', path: 'data.user', description: 'Wallet that created the token', category: 'accounts' },
  ],
  // Pump.fun Bonding Curve - CompleteEvent (IDL uses snake_case)
  'CompleteEvent': [
    { name: 'mint', path: 'data.mint', description: 'Token mint address', category: 'accounts' },
    { name: 'wallet', path: 'data.user', description: 'Wallet that triggered completion', category: 'accounts' },
    { name: 'bondingCurve', path: 'data.bonding_curve', description: 'Bonding curve address', category: 'accounts' },
  ],
  // Pump.fun Bonding Curve - CompletePumpAmmMigrationEvent (IDL uses snake_case)
  'CompletePumpAmmMigrationEvent': [
    { name: 'mint', path: 'data.mint', description: 'Token mint address', category: 'accounts' },
    { name: 'wallet', path: 'data.user', description: 'Wallet that triggered migration', category: 'accounts' },
    { name: 'bondingCurve', path: 'data.bonding_curve', description: 'Bonding curve address', category: 'accounts' },
    { name: 'pool', path: 'data.pool', description: 'New PumpSwap pool address', category: 'accounts' },
    { name: 'tokenAmount', path: 'data.mint_amount', description: 'Token amount migrated', category: 'amounts' },
    { name: 'solAmount', path: 'data.sol_amount', description: 'SOL amount migrated', category: 'amounts', pipe: 'lamportsToSol' },
    { name: 'migrationFee', path: 'data.pool_migration_fee', description: 'Migration fee', category: 'amounts', pipe: 'lamportsToSol' },
  ],
  // Pump.fun Bonding Curve - SetCreatorEvent (IDL uses snake_case)
  'SetCreatorEvent': [
    { name: 'mint', path: 'data.mint', description: 'Token mint address', category: 'accounts' },
    { name: 'bondingCurve', path: 'data.bonding_curve', description: 'Bonding curve address', category: 'accounts' },
    { name: 'creator', path: 'data.creator', description: 'New creator address', category: 'accounts' },
  ],
  // Pump.fun Bonding Curve - CollectCreatorFeeEvent (IDL uses snake_case)
  'CollectCreatorFeeEvent': [
    { name: 'creator', path: 'data.creator', description: 'Creator wallet', category: 'accounts' },
    { name: 'creatorFee', path: 'data.creator_fee', description: 'Fee amount collected', category: 'amounts', pipe: 'lamportsToSol' },
  ],
  // PumpSwap - BuyEvent / SellEvent (IDL uses snake_case)
  'BuyEvent': [
    { name: 'baseAmountOut', path: 'data.base_amount_out', description: 'Token amount out', category: 'amounts' },
    { name: 'quoteAmountIn', path: 'data.quote_amount_in', description: 'SOL amount in', category: 'amounts', pipe: 'lamportsToSol' },
    { name: 'poolBaseAmount', path: 'data.pool_base_token_reserves', description: 'Pool token balance', category: 'amounts' },
    { name: 'poolQuoteAmount', path: 'data.pool_quote_token_reserves', description: 'Pool SOL balance', category: 'amounts', pipe: 'lamportsToSol' },
    { name: 'lpFee', path: 'data.lp_fee', description: 'LP fee', category: 'amounts', pipe: 'lamportsToSol' },
    { name: 'protocolFee', path: 'data.protocol_fee', description: 'Protocol fee', category: 'amounts', pipe: 'lamportsToSol' },
  ],
  'SellEvent': [
    { name: 'baseAmountIn', path: 'data.base_amount_in', description: 'Token amount in', category: 'amounts' },
    { name: 'quoteAmountOut', path: 'data.quote_amount_out', description: 'SOL amount out', category: 'amounts', pipe: 'lamportsToSol' },
    { name: 'poolBaseAmount', path: 'data.pool_base_token_reserves', description: 'Pool token balance', category: 'amounts' },
    { name: 'poolQuoteAmount', path: 'data.pool_quote_token_reserves', description: 'Pool SOL balance', category: 'amounts', pipe: 'lamportsToSol' },
    { name: 'lpFee', path: 'data.lp_fee', description: 'LP fee', category: 'amounts', pipe: 'lamportsToSol' },
    { name: 'protocolFee', path: 'data.protocol_fee', description: 'Protocol fee', category: 'amounts', pipe: 'lamportsToSol' },
  ],
  'CreatePoolEvent': [
    { name: 'creator', path: 'data.creator', description: 'Pool creator', category: 'accounts' },
    { name: 'baseMint', path: 'data.base_mint', description: 'Token mint', category: 'accounts' },
    { name: 'quoteMint', path: 'data.quote_mint', description: 'Quote mint (SOL)', category: 'accounts' },
    { name: 'baseAmountIn', path: 'data.base_amount_in', description: 'Initial token amount', category: 'amounts' },
    { name: 'quoteAmountIn', path: 'data.quote_amount_in', description: 'Initial SOL amount', category: 'amounts', pipe: 'lamportsToSol' },
    { name: 'poolBaseAmount', path: 'data.pool_base_amount', description: 'Pool token balance', category: 'amounts' },
    { name: 'poolQuoteAmount', path: 'data.pool_quote_amount', description: 'Pool SOL balance', category: 'amounts', pipe: 'lamportsToSol' },
  ],
  // Meteora DBC - EvtSwap2 (IDL uses snake_case)
  'EvtSwap2': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'tradeDirection', path: 'data.trade_direction', description: 'Trade direction (0=buy, 1=sell)', category: 'trade' },
    { name: 'quoteReserve', path: 'data.quote_reserve_amount', description: 'Quote reserve amount', category: 'amounts', pipe: 'lamportsToSol' },
    { name: 'migrationThreshold', path: 'data.migration_threshold', description: 'Migration threshold', category: 'amounts', pipe: 'lamportsToSol' },
    // Nested swap_result fields
    { name: 'inputAmount', path: 'data.swap_result.actual_input_amount', description: 'Actual input amount', category: 'amounts' },
    { name: 'outputAmount', path: 'data.swap_result.output_amount', description: 'Output amount', category: 'amounts' },
    { name: 'tradingFee', path: 'data.swap_result.trading_fee', description: 'Trading fee', category: 'amounts' },
  ],
  'EvtCurveComplete': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'config', path: 'data.config', description: 'Config address', category: 'accounts' },
    { name: 'baseReserve', path: 'data.base_reserve', description: 'Base token reserve', category: 'amounts' },
    { name: 'quoteReserve', path: 'data.quote_reserve', description: 'Quote reserve', category: 'amounts', pipe: 'lamportsToSol' },
  ],
  'EvtInitializePool': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'config', path: 'data.config', description: 'Config address', category: 'accounts' },
    { name: 'creator', path: 'data.creator', description: 'Pool creator', category: 'accounts' },
    { name: 'baseMint', path: 'data.base_mint', description: 'Base token mint', category: 'accounts' },
    { name: 'poolType', path: 'data.pool_type', description: 'Pool type', category: 'metadata' },
    { name: 'activationPoint', path: 'data.activation_point', description: 'Activation point', category: 'metadata' },
  ],
  // Meteora DAMM-V1 - Swap (IDL uses snake_case)
  'Swap': [
    { name: 'inAmount', path: 'data.in_amount', description: 'Input amount', category: 'amounts' },
    { name: 'outAmount', path: 'data.out_amount', description: 'Output amount', category: 'amounts' },
    { name: 'tradeFee', path: 'data.trade_fee', description: 'Trade fee', category: 'amounts' },
    { name: 'protocolFee', path: 'data.protocol_fee', description: 'Protocol fee', category: 'amounts' },
    { name: 'hostFee', path: 'data.host_fee', description: 'Host fee', category: 'amounts' },
  ],
  'AddLiquidity': [
    { name: 'lpMintAmount', path: 'data.lp_mint_amount', description: 'LP tokens minted', category: 'amounts' },
    { name: 'tokenAAmount', path: 'data.token_a_amount', description: 'Token A amount', category: 'amounts' },
    { name: 'tokenBAmount', path: 'data.token_b_amount', description: 'Token B amount', category: 'amounts' },
  ],
  'RemoveLiquidity': [
    { name: 'lpUnmintAmount', path: 'data.lp_unmint_amount', description: 'LP tokens burned', category: 'amounts' },
    { name: 'tokenAOutAmount', path: 'data.token_a_out_amount', description: 'Token A received', category: 'amounts' },
    { name: 'tokenBOutAmount', path: 'data.token_b_out_amount', description: 'Token B received', category: 'amounts' },
  ],
  'BootstrapLiquidity': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'lpMintAmount', path: 'data.lp_mint_amount', description: 'LP tokens minted', category: 'amounts' },
    { name: 'tokenAAmount', path: 'data.token_a_amount', description: 'Token A amount', category: 'amounts' },
    { name: 'tokenBAmount', path: 'data.token_b_amount', description: 'Token B amount', category: 'amounts' },
  ],
  // Pump.fun Bonding Curve additional events
  'SetMetaplexCreatorEvent': [
    { name: 'mint', path: 'data.mint', description: 'Token mint address', category: 'accounts' },
    { name: 'metaplexCreator', path: 'data.metaplex_creator', description: 'Metaplex creator address', category: 'accounts' },
  ],
  'SetParamsEvent': [
    { name: 'feeRecipient', path: 'data.fee_recipient', description: 'Fee recipient address', category: 'accounts' },
    { name: 'tradingFeeNumerator', path: 'data.trading_fee_numerator', description: 'Trading fee numerator', category: 'amounts' },
    { name: 'tradingFeeDenominator', path: 'data.trading_fee_denominator', description: 'Trading fee denominator', category: 'amounts' },
    { name: 'creatorFeePct', path: 'data.creator_fee_pct', description: 'Creator fee percentage', category: 'amounts' },
  ],
  // PumpSwap additional events
  'DepositEvent': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'lpTokenAmountOut', path: 'data.lp_token_amount_out', description: 'LP tokens received', category: 'amounts' },
    { name: 'baseAmountIn', path: 'data.base_amount_in', description: 'Token amount deposited', category: 'amounts' },
    { name: 'quoteAmountIn', path: 'data.quote_amount_in', description: 'SOL amount deposited', category: 'amounts', pipe: 'lamportsToSol' },
    { name: 'poolBaseAmount', path: 'data.pool_base_token_reserves', description: 'Pool token balance', category: 'amounts' },
    { name: 'poolQuoteAmount', path: 'data.pool_quote_token_reserves', description: 'Pool SOL balance', category: 'amounts', pipe: 'lamportsToSol' },
  ],
  'WithdrawEvent': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'lpTokenAmountIn', path: 'data.lp_token_amount_in', description: 'LP tokens burned', category: 'amounts' },
    { name: 'baseAmountOut', path: 'data.base_amount_out', description: 'Token amount received', category: 'amounts' },
    { name: 'quoteAmountOut', path: 'data.quote_amount_out', description: 'SOL amount received', category: 'amounts', pipe: 'lamportsToSol' },
    { name: 'poolBaseAmount', path: 'data.pool_base_token_reserves', description: 'Pool token balance', category: 'amounts' },
    { name: 'poolQuoteAmount', path: 'data.pool_quote_token_reserves', description: 'Pool SOL balance', category: 'amounts', pipe: 'lamportsToSol' },
  ],
  'CollectCoinCreatorFeeEvent': [
    { name: 'coinCreator', path: 'data.coin_creator', description: 'Creator address', category: 'accounts' },
    { name: 'coinCreatorFee', path: 'data.coin_creator_fee', description: 'Fee amount collected', category: 'amounts', pipe: 'lamportsToSol' },
  ],
  'SetBondingCurveCoinCreatorEvent': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'coinCreator', path: 'data.coin_creator', description: 'New creator address', category: 'accounts' },
  ],
  'SetMetaplexCoinCreatorEvent': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'coinCreator', path: 'data.coin_creator', description: 'New creator address', category: 'accounts' },
  ],
  // Meteora DBC additional events
  'EvtClaimTradingFee': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'tokenBaseAmount', path: 'data.token_base_amount', description: 'Base token fee claimed', category: 'amounts' },
    { name: 'tokenQuoteAmount', path: 'data.token_quote_amount', description: 'Quote token fee claimed', category: 'amounts', pipe: 'lamportsToSol' },
  ],
  'EvtClaimCreatorTradingFee': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'tokenBaseAmount', path: 'data.token_base_amount', description: 'Base token fee claimed', category: 'amounts' },
    { name: 'tokenQuoteAmount', path: 'data.token_quote_amount', description: 'Quote token fee claimed', category: 'amounts', pipe: 'lamportsToSol' },
  ],
  'EvtCreatorWithdrawSurplus': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'surplusAmount', path: 'data.surplus_amount', description: 'Surplus amount withdrawn', category: 'amounts', pipe: 'lamportsToSol' },
  ],
  'EvtVirtualPoolMetadata': [
    { name: 'virtualPoolMetadata', path: 'data.virtual_pool_metadata', description: 'Virtual pool metadata address', category: 'accounts' },
    { name: 'virtualPool', path: 'data.virtual_pool', description: 'Virtual pool address', category: 'accounts' },
  ],
  'EvtCreateMeteoraMigrationMetadata': [
    { name: 'virtualPool', path: 'data.virtual_pool', description: 'Virtual pool address', category: 'accounts' },
  ],
  // Meteora DAMM-V2 events
  'EvtCreatePosition': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'position', path: 'data.position', description: 'Position address', category: 'accounts' },
    { name: 'owner', path: 'data.owner', description: 'Position owner', category: 'accounts' },
  ],
  'EvtClosePosition': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'position', path: 'data.position', description: 'Position address', category: 'accounts' },
    { name: 'owner', path: 'data.owner', description: 'Position owner', category: 'accounts' },
  ],
  'EvtLiquidityChange': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'position', path: 'data.position', description: 'Position address', category: 'accounts' },
    { name: 'owner', path: 'data.owner', description: 'Position owner', category: 'accounts' },
    { name: 'tokenAAmount', path: 'data.token_a_amount', description: 'Token A amount', category: 'amounts' },
    { name: 'tokenBAmount', path: 'data.token_b_amount', description: 'Token B amount', category: 'amounts' },
    { name: 'liquidityDelta', path: 'data.liquidity_delta', description: 'Liquidity change', category: 'amounts' },
  ],
  'EvtClaimPositionFee': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'position', path: 'data.position', description: 'Position address', category: 'accounts' },
    { name: 'owner', path: 'data.owner', description: 'Position owner', category: 'accounts' },
    { name: 'feeAAmount', path: 'data.fee_a_amount', description: 'Token A fee claimed', category: 'amounts' },
    { name: 'feeBAmount', path: 'data.fee_b_amount', description: 'Token B fee claimed', category: 'amounts' },
  ],
  'EvtClaimReward': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'position', path: 'data.position', description: 'Position address', category: 'accounts' },
    { name: 'owner', path: 'data.owner', description: 'Position owner', category: 'accounts' },
    { name: 'rewardAmount', path: 'data.reward_amount', description: 'Reward amount claimed', category: 'amounts' },
  ],
  'EvtLockPosition': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'position', path: 'data.position', description: 'Position address', category: 'accounts' },
    { name: 'owner', path: 'data.owner', description: 'Position owner', category: 'accounts' },
  ],
  // Meteora DLMM events
  'ClaimFee': [
    { name: 'lbPair', path: 'data.lb_pair', description: 'LB Pair address', category: 'accounts' },
    { name: 'position', path: 'data.position', description: 'Position address', category: 'accounts' },
    { name: 'owner', path: 'data.owner', description: 'Position owner', category: 'accounts' },
    { name: 'feeX', path: 'data.fee_x', description: 'Fee X amount', category: 'amounts' },
    { name: 'feeY', path: 'data.fee_y', description: 'Fee Y amount', category: 'amounts' },
  ],
  'ClaimReward': [
    { name: 'lbPair', path: 'data.lb_pair', description: 'LB Pair address', category: 'accounts' },
    { name: 'position', path: 'data.position', description: 'Position address', category: 'accounts' },
    { name: 'owner', path: 'data.owner', description: 'Position owner', category: 'accounts' },
    { name: 'rewardIndex', path: 'data.reward_index', description: 'Reward index', category: 'metadata' },
    { name: 'totalReward', path: 'data.total_reward', description: 'Total reward claimed', category: 'amounts' },
  ],
  'PositionCreate': [
    { name: 'lbPair', path: 'data.lb_pair', description: 'LB Pair address', category: 'accounts' },
    { name: 'position', path: 'data.position', description: 'Position address', category: 'accounts' },
    { name: 'owner', path: 'data.owner', description: 'Position owner', category: 'accounts' },
  ],
  'PositionClose': [
    { name: 'lbPair', path: 'data.lb_pair', description: 'LB Pair address', category: 'accounts' },
    { name: 'position', path: 'data.position', description: 'Position address', category: 'accounts' },
    { name: 'owner', path: 'data.owner', description: 'Position owner', category: 'accounts' },
  ],
  'LbPairCreate': [
    { name: 'lbPair', path: 'data.lb_pair', description: 'LB Pair address', category: 'accounts' },
    { name: 'binStep', path: 'data.bin_step', description: 'Bin step', category: 'metadata' },
    { name: 'tokenXMint', path: 'data.token_x_mint', description: 'Token X mint', category: 'accounts' },
    { name: 'tokenYMint', path: 'data.token_y_mint', description: 'Token Y mint', category: 'accounts' },
  ],
  'CompositionFee': [
    { name: 'lbPair', path: 'data.lb_pair', description: 'LB Pair address', category: 'accounts' },
    { name: 'from', path: 'data.from', description: 'Source address', category: 'accounts' },
    { name: 'binId', path: 'data.bin_id', description: 'Bin ID', category: 'metadata' },
    { name: 'tokenXFeeAmount', path: 'data.token_x_fee_amount', description: 'Token X fee', category: 'amounts' },
    { name: 'tokenYFeeAmount', path: 'data.token_y_fee_amount', description: 'Token Y fee', category: 'amounts' },
    { name: 'protocolTokenXFee', path: 'data.protocol_token_x_fee_amount', description: 'Protocol Token X fee', category: 'amounts' },
    { name: 'protocolTokenYFee', path: 'data.protocol_token_y_fee_amount', description: 'Protocol Token Y fee', category: 'amounts' },
  ],
};

// Category labels and colors
const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  identity: { label: 'Identity', color: 'bg-blue-500/10 text-blue-400' },
  trade: { label: 'Trade', color: 'bg-green-500/10 text-green-400' },
  amounts: { label: 'Amounts', color: 'bg-yellow-500/10 text-yellow-400' },
  accounts: { label: 'Accounts', color: 'bg-purple-500/10 text-purple-400' },
  metadata: { label: 'Metadata', color: 'bg-pink-500/10 text-pink-400' },
};

export default function NewPipelinePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('programs');
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [selectedPrograms, setSelectedPrograms] = useState<string[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>(['signature', 'timestamp', 'eventName']);
  const [discordWebhook, setDiscordWebhook] = useState('');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [enableWebsocket, setEnableWebsocket] = useState(true);

  // Advanced filter state
  const [mintAddresses, setMintAddresses] = useState('');
  const [walletAddresses, setWalletAddresses] = useState('');
  const [tradeDirection, setTradeDirection] = useState<'all' | 'buy' | 'sell'>('all');
  const [minSolAmount, setMinSolAmount] = useState('');
  const [maxSolAmount, setMaxSolAmount] = useState('');
  const [minTokenAmount, setMinTokenAmount] = useState('');
  const [maxTokenAmount, setMaxTokenAmount] = useState('');

  useEffect(() => {
    loadPrograms();
  }, []);

  const loadPrograms = async () => {
    try {
      const data = await getPrograms();
      setPrograms(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load programs');
    } finally {
      setLoading(false);
    }
  };

  // Get available fields based on selected events
  const availableFields = useMemo(() => {
    const events = selectedEvents.length > 0
      ? selectedEvents
      : selectedPrograms.flatMap(p => PROGRAM_EVENTS[p] || []);

    // Collect all unique fields from selected events
    const eventFieldsSet = new Map<string, FieldDef>();

    // Add common fields first
    COMMON_FIELDS.forEach(f => eventFieldsSet.set(f.name, f));

    // Add event-specific fields
    events.forEach(eventName => {
      const fields = EVENT_FIELDS[eventName] || [];
      fields.forEach(f => {
        // If field already exists, keep it (common fields or first occurrence)
        if (!eventFieldsSet.has(f.name)) {
          eventFieldsSet.set(f.name, f);
        }
      });
    });

    return Array.from(eventFieldsSet.values());
  }, [selectedPrograms, selectedEvents]);

  // Group fields by category
  const fieldsByCategory = useMemo(() => {
    const grouped: Record<string, FieldDef[]> = {};
    availableFields.forEach(field => {
      if (!grouped[field.category]) {
        grouped[field.category] = [];
      }
      grouped[field.category].push(field);
    });
    return grouped;
  }, [availableFields]);

  // Get the active events for preview
  const activeEvents = useMemo(() => {
    return selectedEvents.length > 0
      ? selectedEvents
      : selectedPrograms.flatMap(p => PROGRAM_EVENTS[p] || []);
  }, [selectedPrograms, selectedEvents]);

  // Check if user has selected high volume events
  const highVolumeWarning = useMemo(() => {
    const warnings: { program: string; events: string[]; volume: string }[] = [];

    selectedPrograms.forEach(programId => {
      const highVolume = HIGH_VOLUME_EVENTS[programId];
      if (!highVolume) return;

      // If no specific events selected, all events including high volume ones are included
      const eventsToCheck = selectedEvents.length > 0
        ? selectedEvents
        : PROGRAM_EVENTS[programId] || [];

      const matchingHighVolumeEvents = highVolume.events.filter(e => eventsToCheck.includes(e));

      if (matchingHighVolumeEvents.length > 0) {
        warnings.push({
          program: programId,
          events: matchingHighVolumeEvents,
          volume: highVolume.estimatedVolume,
        });
      }
    });

    return warnings;
  }, [selectedPrograms, selectedEvents]);

  // Build output preview per event type
  const outputPreviews = useMemo(() => {
    const getExampleValue = (fieldName: string, eventName: string): string => {
      switch (fieldName) {
        case 'signature':
          return '"5K2x...9Qm3"';
        case 'timestamp':
          return '"2025-01-13T12:34:56Z"';
        case 'slot':
          return '312456789';
        case 'feePayer':
        case 'wallet':
        case 'creator':
        case 'mint':
        case 'pool':
        case 'bondingCurve':
        case 'baseMint':
        case 'quoteMint':
        case 'inputMint':
        case 'outputMint':
          return '"So1a...ddRs"';
        case 'eventName':
          return `"${eventName}"`;
        case 'program':
          return '"PUMP_BONDING_CURVE"';
        case 'isBuy':
          return 'true';
        case 'solAmount':
        case 'quoteAmountIn':
        case 'quoteAmountOut':
        case 'virtualSolReserves':
        case 'poolQuoteAmount':
        case 'migrationFee':
          return '1.5';
        case 'tokenAmount':
        case 'baseAmountOut':
        case 'baseAmountIn':
        case 'virtualTokenReserves':
        case 'poolBaseAmount':
        case 'inputAmount':
        case 'outputAmount':
        case 'tokenAAmount':
        case 'tokenBAmount':
        case 'lpAmount':
        case 'feeAmount':
        case 'tradingFee':
          return '1000000';
        case 'tokenName':
          return '"My Token"';
        case 'symbol':
          return '"MTK"';
        case 'uri':
          return '"https://..."';
        default:
          return '"..."';
      }
    };

    // Get fields available for each event
    const getFieldsForEvent = (eventName: string): string[] => {
      const eventFields = EVENT_FIELDS[eventName] || [];
      const eventFieldNames = new Set(eventFields.map(f => f.name));
      const commonFieldNames = new Set(COMMON_FIELDS.map(f => f.name));

      // Return selected fields that are either common or specific to this event
      return selectedFields.filter(fieldName =>
        commonFieldNames.has(fieldName) || eventFieldNames.has(fieldName)
      );
    };

    // Build preview for each event type
    return activeEvents.map(eventName => {
      const fieldsForEvent = getFieldsForEvent(eventName);
      const preview: Record<string, string> = {};

      fieldsForEvent.forEach(fieldName => {
        preview[fieldName] = getExampleValue(fieldName, eventName);
      });

      return { eventName, preview };
    });
  }, [selectedFields, activeEvents]);

  const toggleProgram = (id: string) => {
    setSelectedPrograms(prev => {
      if (prev.includes(id)) {
        // When removing a program, also remove its events from selectedEvents
        const programEvents = PROGRAM_EVENTS[id] || [];
        setSelectedEvents(prevEvents =>
          prevEvents.filter(e => !programEvents.includes(e))
        );
        return prev.filter(p => p !== id);
      }
      return [...prev, id];
    });
  };

  const toggleEvent = (eventName: string) => {
    setSelectedEvents(prev =>
      prev.includes(eventName) ? prev.filter(e => e !== eventName) : [...prev, eventName]
    );
  };

  const toggleField = (fieldName: string) => {
    setSelectedFields(prev =>
      prev.includes(fieldName) ? prev.filter(f => f !== fieldName) : [...prev, fieldName]
    );
  };

  const selectAllFields = () => {
    setSelectedFields(availableFields.map(f => f.name));
  };

  const clearAllFields = () => {
    setSelectedFields([]);
  };

  const handleCreate = async () => {
    setSaving(true);
    setError('');

    try {
      const destinations: Record<string, unknown> = {};

      if (discordWebhook) {
        destinations.discord = { enabled: true, webhookUrl: discordWebhook };
      }
      if (telegramBotToken && telegramChatId) {
        destinations.telegram = { enabled: true, botToken: telegramBotToken, chatId: telegramChatId };
      }
      if (webhookUrl) {
        destinations.webhook = { enabled: true, url: webhookUrl };
      }
      if (enableWebsocket) {
        destinations.websocket = { enabled: true };
      }

      if (Object.keys(destinations).length === 0) {
        setError('Please enable at least one destination');
        setSaving(false);
        return;
      }

      // Build field mapping for transform
      const fields = selectedFields.map(fieldName => {
        const field = availableFields.find(f => f.name === fieldName);
        return {
          source: field?.path || fieldName,
          target: fieldName,
          pipe: field?.pipe,
        };
      });

      // Build filter object
      const filter: Record<string, unknown> = {};

      // Event types
      if (selectedEvents.length > 0) {
        filter.instructions = selectedEvents;
      }

      // Trade direction (isBuy filter)
      if (tradeDirection !== 'all') {
        filter.isBuy = tradeDirection === 'buy';
      }

      // Mint addresses
      const mints = mintAddresses.trim().split('\n').map(s => s.trim()).filter(Boolean);
      if (mints.length > 0) {
        filter.mints = mints;
      }

      // Wallet addresses
      const wallets = walletAddresses.trim().split('\n').map(s => s.trim()).filter(Boolean);
      if (wallets.length > 0) {
        filter.wallets = wallets;
      }

      // SOL amount range
      if (minSolAmount || maxSolAmount) {
        filter.solAmount = {
          ...(minSolAmount && { min: parseFloat(minSolAmount) }),
          ...(maxSolAmount && { max: parseFloat(maxSolAmount) }),
        };
      }

      // Token amount range
      if (minTokenAmount || maxTokenAmount) {
        filter.tokenAmount = {
          ...(minTokenAmount && { min: parseFloat(minTokenAmount) }),
          ...(maxTokenAmount && { max: parseFloat(maxTokenAmount) }),
        };
      }

      const pipeline = await createPipeline({
        name: name || undefined,
        programs: selectedPrograms,
        filter,
        transform: { mode: 'fields', fields },
        destinations,
      });

      router.push(`/pipelines/${pipeline.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create pipeline');
      setSaving(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 'programs':
        return selectedPrograms.length > 0;
      case 'filter':
        return selectedEvents.length > 0;
      case 'transform':
        return selectedFields.length > 0;
      case 'destinations':
        return discordWebhook || (telegramBotToken && telegramChatId) || webhookUrl || enableWebsocket;
      default:
        return false;
    }
  };

  const nextStep = () => {
    const steps: Step[] = ['programs', 'filter', 'transform', 'destinations'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1]);
    }
  };

  const prevStep = () => {
    const steps: Step[] = ['programs', 'filter', 'transform', 'destinations'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
    }
  };

  if (loading) {
    return (
      <>
        <Header title="New Pipeline" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-[var(--muted)]">Loading...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="New Pipeline" />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto">
          {/* Progress */}
          <div className="flex items-center gap-2 mb-8">
            {['programs', 'filter', 'transform', 'destinations'].map((s, i) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    step === s
                      ? 'bg-[var(--accent)] text-white'
                      : i < ['programs', 'filter', 'transform', 'destinations'].indexOf(step)
                      ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                      : 'bg-[var(--border)] text-[var(--muted)]'
                  }`}
                >
                  {i + 1}
                </div>
                {i < 3 && (
                  <div className={`w-12 h-0.5 ${
                    i < ['programs', 'filter', 'transform', 'destinations'].indexOf(step)
                      ? 'bg-[var(--accent)]'
                      : 'bg-[var(--border)]'
                  }`} />
                )}
              </div>
            ))}
          </div>

          {/* Name */}
          <div className="mb-6">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pipeline name (optional)"
              className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-[var(--error)]/10 text-[var(--error)] rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Step content */}
          {step === 'programs' && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold">Select Programs</h2>
                <p className="text-sm text-[var(--muted)] mt-1">
                  Choose which Solana programs to monitor
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {programs.map((program) => (
                    <button
                      key={program.id}
                      onClick={() => toggleProgram(program.id)}
                      className={`p-4 rounded-lg border text-left transition-colors cursor-pointer ${
                        selectedPrograms.includes(program.id)
                          ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                          : 'border-[var(--border)] hover:border-[var(--muted)]'
                      }`}
                    >
                      <div className="font-medium text-sm">{program.name}</div>
                      <div className="text-xs text-[var(--muted)] mt-1">
                        {program.category}
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {step === 'filter' && (
            <div className="space-y-4">
              {/* Event Type Filter */}
              <Card>
                <CardHeader>
                  <h2 className="font-semibold">Event Types <span className="text-[var(--error)]">*</span></h2>
                  <p className="text-sm text-[var(--muted)] mt-1">
                    Select which events to include in your pipeline
                  </p>
                </CardHeader>
                <CardContent>
                  {selectedPrograms.map((programId) => {
                    const events = PROGRAM_EVENTS[programId] || [];
                    const program = programs.find(p => p.id === programId);
                    return (
                      <div key={programId} className="mb-4 last:mb-0">
                        <div className="text-sm font-medium mb-2 text-[var(--muted)]">
                          {program?.name || programId}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {events.map((eventName) => (
                            <button
                              key={eventName}
                              onClick={() => toggleEvent(eventName)}
                              className={`px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${
                                selectedEvents.includes(eventName)
                                  ? 'bg-[var(--accent)] text-white'
                                  : 'bg-[var(--border)] hover:bg-[var(--border)]/80'
                              }`}
                            >
                              {eventName}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Trade Direction Filter */}
              <Card>
                <CardHeader>
                  <h2 className="font-semibold">Trade Direction</h2>
                  <p className="text-sm text-[var(--muted)] mt-1">
                    Filter by buy or sell transactions
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    {(['all', 'buy', 'sell'] as const).map((direction) => (
                      <button
                        key={direction}
                        onClick={() => setTradeDirection(direction)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                          tradeDirection === direction
                            ? 'bg-[var(--accent)] text-white'
                            : 'bg-[var(--border)] hover:bg-[var(--border)]/80'
                        }`}
                      >
                        {direction === 'all' ? 'All Trades' : direction === 'buy' ? 'Buys Only' : 'Sells Only'}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Token Mint Filter */}
              <Card>
                <CardHeader>
                  <h2 className="font-semibold">Token Mints</h2>
                  <p className="text-sm text-[var(--muted)] mt-1">
                    Only include events for specific tokens (leave empty for all)
                  </p>
                </CardHeader>
                <CardContent>
                  <textarea
                    value={mintAddresses}
                    onChange={(e) => setMintAddresses(e.target.value)}
                    placeholder="Enter token mint addresses, one per line&#10;e.g. So11111111111111111111111111111111111111112"
                    rows={3}
                    className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50 font-mono resize-none"
                  />
                  <p className="text-xs text-[var(--muted)] mt-2">
                    Filters events by mint, baseMint, or tokenMint fields
                  </p>
                </CardContent>
              </Card>

              {/* Wallet Filter */}
              <Card>
                <CardHeader>
                  <h2 className="font-semibold">Wallet Addresses</h2>
                  <p className="text-sm text-[var(--muted)] mt-1">
                    Only include events from specific wallets (leave empty for all)
                  </p>
                </CardHeader>
                <CardContent>
                  <textarea
                    value={walletAddresses}
                    onChange={(e) => setWalletAddresses(e.target.value)}
                    placeholder="Enter wallet addresses, one per line&#10;e.g. 5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
                    rows={3}
                    className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50 font-mono resize-none"
                  />
                  <p className="text-xs text-[var(--muted)] mt-2">
                    Filters by wallet, user, creator, or feePayer fields
                  </p>
                </CardContent>
              </Card>

              {/* Amount Filters */}
              <Card>
                <CardHeader>
                  <h2 className="font-semibold">Amount Filters</h2>
                  <p className="text-sm text-[var(--muted)] mt-1">
                    Filter by transaction amounts (leave empty for no limit)
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* SOL Amount */}
                  <div>
                    <label className="text-sm font-medium text-[var(--muted)] block mb-2">
                      SOL Amount
                    </label>
                    <div className="flex gap-3 items-center">
                      <div className="flex-1">
                        <input
                          type="number"
                          value={minSolAmount}
                          onChange={(e) => setMinSolAmount(e.target.value)}
                          placeholder="Min"
                          step="0.001"
                          min="0"
                          className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                        />
                      </div>
                      <span className="text-[var(--muted)]">to</span>
                      <div className="flex-1">
                        <input
                          type="number"
                          value={maxSolAmount}
                          onChange={(e) => setMaxSolAmount(e.target.value)}
                          placeholder="Max"
                          step="0.001"
                          min="0"
                          className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                        />
                      </div>
                      <span className="text-sm text-[var(--muted)]">SOL</span>
                    </div>
                  </div>

                  {/* Token Amount */}
                  <div>
                    <label className="text-sm font-medium text-[var(--muted)] block mb-2">
                      Token Amount
                    </label>
                    <div className="flex gap-3 items-center">
                      <div className="flex-1">
                        <input
                          type="number"
                          value={minTokenAmount}
                          onChange={(e) => setMinTokenAmount(e.target.value)}
                          placeholder="Min"
                          step="1"
                          min="0"
                          className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                        />
                      </div>
                      <span className="text-[var(--muted)]">to</span>
                      <div className="flex-1">
                        <input
                          type="number"
                          value={maxTokenAmount}
                          onChange={(e) => setMaxTokenAmount(e.target.value)}
                          placeholder="Max"
                          step="1"
                          min="0"
                          className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                        />
                      </div>
                      <span className="text-sm text-[var(--muted)]">tokens</span>
                    </div>
                  </div>

                  <p className="text-xs text-[var(--muted)]">
                    SOL amounts filter solAmount, quoteAmountIn/Out fields. Token amounts filter tokenAmount, baseAmountIn/Out fields.
                  </p>
                </CardContent>
              </Card>

              {/* Filter Summary */}
              <div className="p-3 bg-[var(--border)]/30 border border-[var(--border)] rounded-lg">
                <div className="text-sm font-medium mb-2">Summary</div>
                <div className="text-sm text-[var(--muted)]">
                  {selectedEvents.length === 0 && tradeDirection === 'all' && !mintAddresses.trim() && !walletAddresses.trim() && !minSolAmount && !maxSolAmount && !minTokenAmount && !maxTokenAmount ? (
                    <span>No filters applied — all events from selected programs will be included</span>
                  ) : (
                    <div className="space-y-1">
                      <div>
                        <span className="text-[var(--foreground)]">Events: </span>
                        {selectedEvents.length > 0
                          ? selectedEvents.join(', ')
                          : 'All events'}
                      </div>
                      {tradeDirection !== 'all' && (
                        <div>
                          <span className="text-[var(--foreground)]">Direction: </span>
                          {tradeDirection === 'buy' ? 'Buys only' : 'Sells only'}
                        </div>
                      )}
                      {mintAddresses.trim() && (
                        <div>
                          <span className="text-[var(--foreground)]">Tokens: </span>
                          {mintAddresses.trim().split('\n').filter(Boolean).length} mint address{mintAddresses.trim().split('\n').filter(Boolean).length > 1 ? 'es' : ''}
                        </div>
                      )}
                      {walletAddresses.trim() && (
                        <div>
                          <span className="text-[var(--foreground)]">Wallets: </span>
                          {walletAddresses.trim().split('\n').filter(Boolean).length} address{walletAddresses.trim().split('\n').filter(Boolean).length > 1 ? 'es' : ''}
                        </div>
                      )}
                      {(minSolAmount || maxSolAmount) && (
                        <div>
                          <span className="text-[var(--foreground)]">SOL range: </span>
                          {minSolAmount || '0'} — {maxSolAmount || 'unlimited'}
                        </div>
                      )}
                      {(minTokenAmount || maxTokenAmount) && (
                        <div>
                          <span className="text-[var(--foreground)]">Token range: </span>
                          {minTokenAmount || '0'} — {maxTokenAmount || 'unlimited'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 'transform' && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold">Select Output Fields</h2>
                      <p className="text-sm text-[var(--muted)] mt-1">
                        Choose which fields to include in your output
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={selectAllFields}
                        className="text-xs text-[var(--accent)] hover:underline cursor-pointer"
                      >
                        Select all
                      </button>
                      <span className="text-[var(--muted)]">|</span>
                      <button
                        onClick={clearAllFields}
                        className="text-xs text-[var(--muted)] hover:underline cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {Object.entries(fieldsByCategory).map(([category, fields]) => (
                      <div key={category}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_LABELS[category]?.color || 'bg-gray-500/10 text-gray-400'}`}>
                            {CATEGORY_LABELS[category]?.label || category}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {fields.map((field) => (
                            <button
                              key={field.name}
                              onClick={() => toggleField(field.name)}
                              title={field.description}
                              className={`px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${
                                selectedFields.includes(field.name)
                                  ? 'bg-[var(--accent)] text-white'
                                  : 'bg-[var(--border)] hover:bg-[var(--border)]/80'
                              }`}
                            >
                              {field.name}
                              {field.pipe && (
                                <span className="ml-1 opacity-60 text-xs">*</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-[var(--muted)] mt-4">
                    * Fields with transforms applied (e.g., lamports → SOL)
                  </p>
                </CardContent>
              </Card>

              {/* Output Preview */}
              {selectedFields.length > 0 && outputPreviews.length > 0 && (
                <Card>
                  <CardHeader>
                    <h2 className="font-semibold">Output Preview</h2>
                    <p className="text-sm text-[var(--muted)] mt-1">
                      {outputPreviews.length === 1
                        ? 'Your events will look like this'
                        : `Example output for each event type (${outputPreviews.length} types)`}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {outputPreviews.slice(0, 3).map(({ eventName, preview }) => (
                        <div key={eventName}>
                          <div className="text-xs text-[var(--muted)] mb-2 font-medium">
                            {eventName}
                          </div>
                          <div className="bg-[var(--background)] border border-[var(--border)] rounded-lg p-3 font-mono text-xs overflow-x-auto">
                            <pre className="text-[var(--foreground)]">
{`{
${Object.entries(preview).map(([key, value]) => `  "${key}": ${value}`).join(',\n')}
}`}
                            </pre>
                          </div>
                        </div>
                      ))}
                      {outputPreviews.length > 3 && (
                        <p className="text-xs text-[var(--muted)]">
                          + {outputPreviews.length - 3} more event types...
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {step === 'destinations' && (
            <div className="space-y-4">
              {/* High Volume Warning */}
              {highVolumeWarning.length > 0 && (discordWebhook || telegramBotToken) && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="text-yellow-500 mt-0.5">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-yellow-500 mb-1">High Volume Events Detected</h3>
                      <p className="text-sm text-[var(--muted)] mb-3">
                        Your selected events generate high transaction volume that may exceed Discord/Telegram rate limits.
                      </p>
                      <div className="space-y-2 mb-3">
                        {highVolumeWarning.map(({ program, events, volume }) => (
                          <div key={program} className="text-sm">
                            <span className="text-[var(--foreground)]">{events.join(', ')}</span>
                            <span className="text-[var(--muted)]"> on {program}: </span>
                            <span className="text-yellow-500 font-medium">{volume}</span>
                          </div>
                        ))}
                      </div>
                      <div className="text-sm text-[var(--muted)] space-y-1">
                        <p className="font-medium text-[var(--foreground)]">Rate Limits:</p>
                        <p>Discord: ~150 messages/min per webhook</p>
                        <p>Telegram: ~20 messages/min to same chat</p>
                      </div>
                      <div className="mt-3 pt-3 border-t border-yellow-500/20">
                        <p className="text-sm text-[var(--foreground)] font-medium mb-2">Recommendations:</p>
                        <ul className="text-sm text-[var(--muted)] space-y-1 list-disc list-inside">
                          <li>Add filters (e.g., minimum SOL amount, specific tokens)</li>
                          <li>Use WebSocket for real-time data, Discord/Telegram for filtered alerts</li>
                          <li>Events exceeding rate limits will be queued and may be delayed</li>
                        </ul>
                        <button
                          onClick={() => setStep('filter')}
                          className="mt-3 text-sm text-yellow-500 hover:underline cursor-pointer"
                        >
                          Go back to adjust filters
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <Card>
                <CardHeader>
                  <h2 className="font-semibold">Discord</h2>
                </CardHeader>
                <CardContent>
                  <input
                    type="text"
                    value={discordWebhook}
                    onChange={(e) => setDiscordWebhook(e.target.value)}
                    placeholder="Webhook URL"
                    className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h2 className="font-semibold">Telegram</h2>
                </CardHeader>
                <CardContent className="space-y-3">
                  <input
                    type="text"
                    value={telegramBotToken}
                    onChange={(e) => setTelegramBotToken(e.target.value)}
                    placeholder="Bot Token"
                    className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                  />
                  <input
                    type="text"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    placeholder="Chat ID"
                    className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h2 className="font-semibold">Webhook</h2>
                </CardHeader>
                <CardContent>
                  <input
                    type="text"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="Webhook URL"
                    className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <h2 className="font-semibold">WebSocket</h2>
                  <button
                    onClick={() => setEnableWebsocket(!enableWebsocket)}
                    className={`w-10 h-6 rounded-full transition-colors cursor-pointer ${
                      enableWebsocket ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        enableWebsocket ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-[var(--muted)]">
                    Real-time events via WebSocket. Channel ID will be auto-generated.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-6">
            <Button
              variant="secondary"
              onClick={prevStep}
              disabled={step === 'programs'}
            >
              Back
            </Button>
            {step === 'destinations' ? (
              <Button onClick={handleCreate} disabled={saving || !canProceed()}>
                {saving ? 'Creating...' : 'Create Pipeline'}
              </Button>
            ) : (
              <Button onClick={nextStep} disabled={!canProceed()}>
                Continue
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
