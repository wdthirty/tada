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
  'PUMP_BONDING_CURVE': ['TradeEvent', 'CreateEvent', 'CompleteEvent', 'SetParamsEvent'],
  'PUMPSWAP': ['BuyEvent', 'SellEvent', 'CreatePoolEvent', 'DepositEvent', 'WithdrawEvent'],
  'METEORA_DBC': ['EvtSwap2', 'EvtCurveComplete', 'EvtInitializePool', 'EvtClaimTradingFee'],
  'METEORA_DAMM_V1': ['Swap', 'AddLiquidity', 'RemoveLiquidity', 'ClaimFee'],
  'METEORA_DAMM_V2': ['EvtSwap2', 'EvtCreatePosition', 'EvtClaimPositionFee'],
  'METEORA_DLMM': ['Swap', 'AddLiquidity', 'RemoveLiquidity', 'ClaimFee'],
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
  // Pump.fun Bonding Curve - TradeEvent
  'TradeEvent': [
    { name: 'mint', path: 'data.mint', description: 'Token mint address', category: 'accounts' },
    { name: 'solAmount', path: 'data.solAmount', description: 'SOL amount', category: 'amounts', pipe: 'lamportsToSol' },
    { name: 'tokenAmount', path: 'data.tokenAmount', description: 'Token amount', category: 'amounts' },
    { name: 'isBuy', path: 'data.isBuy', description: 'Buy (true) or Sell (false)', category: 'trade' },
    { name: 'wallet', path: 'data.user', description: 'Wallet that performed the swap', category: 'accounts' },
    { name: 'virtualSolReserves', path: 'data.virtualSolReserves', description: 'Virtual SOL reserves', category: 'amounts', pipe: 'lamportsToSol' },
    { name: 'virtualTokenReserves', path: 'data.virtualTokenReserves', description: 'Virtual token reserves', category: 'amounts' },
  ],
  // Pump.fun Bonding Curve - CreateEvent
  'CreateEvent': [
    { name: 'mint', path: 'data.mint', description: 'Token mint address', category: 'accounts' },
    { name: 'tokenName', path: 'data.name', description: 'Token name', category: 'metadata' },
    { name: 'symbol', path: 'data.symbol', description: 'Token symbol', category: 'metadata' },
    { name: 'uri', path: 'data.uri', description: 'Metadata URI', category: 'metadata' },
    { name: 'bondingCurve', path: 'data.bondingCurve', description: 'Bonding curve address', category: 'accounts' },
    { name: 'creator', path: 'data.user', description: 'Wallet that created the token', category: 'accounts' },
  ],
  // Pump.fun Bonding Curve - CompleteEvent
  'CompleteEvent': [
    { name: 'mint', path: 'data.mint', description: 'Token mint address', category: 'accounts' },
    { name: 'creator', path: 'data.user', description: 'Wallet that created the token', category: 'accounts' },
    { name: 'bondingCurve', path: 'data.bondingCurve', description: 'Bonding curve address', category: 'accounts' },
    { name: 'virtualSolReserves', path: 'data.virtualSolReserves', description: 'Final SOL reserves', category: 'amounts', pipe: 'lamportsToSol' },
    { name: 'virtualTokenReserves', path: 'data.virtualTokenReserves', description: 'Final token reserves', category: 'amounts' },
  ],
  // PumpSwap - BuyEvent / SellEvent
  'BuyEvent': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'wallet', path: 'data.user', description: 'Wallet that performed the swap', category: 'accounts' },
    { name: 'baseAmountOut', path: 'data.baseAmountOut', description: 'Token amount out', category: 'amounts' },
    { name: 'quoteAmountIn', path: 'data.quoteAmountIn', description: 'SOL amount in', category: 'amounts', pipe: 'lamportsToSol' },
    { name: 'poolBaseAmount', path: 'data.poolBaseAmount', description: 'Pool token balance', category: 'amounts' },
    { name: 'poolQuoteAmount', path: 'data.poolQuoteAmount', description: 'Pool SOL balance', category: 'amounts', pipe: 'lamportsToSol' },
  ],
  'SellEvent': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'wallet', path: 'data.user', description: 'Wallet that performed the swap', category: 'accounts' },
    { name: 'baseAmountIn', path: 'data.baseAmountIn', description: 'Token amount in', category: 'amounts' },
    { name: 'quoteAmountOut', path: 'data.quoteAmountOut', description: 'SOL amount out', category: 'amounts', pipe: 'lamportsToSol' },
    { name: 'poolBaseAmount', path: 'data.poolBaseAmount', description: 'Pool token balance', category: 'amounts' },
    { name: 'poolQuoteAmount', path: 'data.poolQuoteAmount', description: 'Pool SOL balance', category: 'amounts', pipe: 'lamportsToSol' },
  ],
  'CreatePoolEvent': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'creator', path: 'data.creator', description: 'Pool creator', category: 'accounts' },
    { name: 'baseMint', path: 'data.baseMint', description: 'Token mint', category: 'accounts' },
    { name: 'quoteMint', path: 'data.quoteMint', description: 'Quote mint (SOL)', category: 'accounts' },
    { name: 'baseAmount', path: 'data.baseAmount', description: 'Initial token amount', category: 'amounts' },
    { name: 'quoteAmount', path: 'data.quoteAmount', description: 'Initial SOL amount', category: 'amounts', pipe: 'lamportsToSol' },
  ],
  // Meteora DBC - only EvtSwap2 supported (per Meteora dev guidance)
  'EvtSwap2': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'tokenMint', path: 'data.token_mint', description: 'Token mint', category: 'accounts' },
    { name: 'quoteMint', path: 'data.quote_mint', description: 'Quote mint (SOL)', category: 'accounts' },
    { name: 'isBuy', path: 'data.is_buy', description: 'Buy or sell', category: 'metadata' },
    { name: 'inputAmount', path: 'data.excluded_fee_input_amount', description: 'Input amount (excl fees)', category: 'amounts' },
    { name: 'outputAmount', path: 'data.output_amount', description: 'Output amount', category: 'amounts' },
    { name: 'tradingFee', path: 'data.trading_fee', description: 'Trading fee', category: 'amounts' },
    { name: 'quoteReserve', path: 'data.quote_reserve_amount', description: 'Quote reserve', category: 'amounts' },
    { name: 'migrationThreshold', path: 'data.migration_threshold', description: 'Migration threshold', category: 'amounts' },
  ],
  'EvtCurveComplete': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'baseMint', path: 'data.baseMint', description: 'Token mint', category: 'accounts' },
    { name: 'migrationFee', path: 'data.migrationFee', description: 'Migration fee', category: 'amounts', pipe: 'lamportsToSol' },
  ],
  'EvtInitializePool': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'creator', path: 'data.creator', description: 'Pool creator', category: 'accounts' },
    { name: 'tokenAMint', path: 'data.token_a_mint', description: 'Token A mint', category: 'accounts' },
    { name: 'tokenBMint', path: 'data.token_b_mint', description: 'Token B mint', category: 'accounts' },
    { name: 'tokenName', path: 'data.token_name', description: 'Token name', category: 'metadata' },
    { name: 'tokenSymbol', path: 'data.token_symbol', description: 'Token symbol', category: 'metadata' },
    { name: 'tokenUri', path: 'data.token_uri', description: 'Token metadata URI', category: 'metadata' },
  ],
  // Meteora AMM - Swap
  'Swap': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'inputMint', path: 'data.inputMint', description: 'Input token mint', category: 'accounts' },
    { name: 'outputMint', path: 'data.outputMint', description: 'Output token mint', category: 'accounts' },
    { name: 'inputAmount', path: 'data.inputAmount', description: 'Input amount', category: 'amounts' },
    { name: 'outputAmount', path: 'data.outputAmount', description: 'Output amount', category: 'amounts' },
  ],
  'AddLiquidity': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'wallet', path: 'data.user', description: 'Wallet that added liquidity', category: 'accounts' },
    { name: 'tokenAAmount', path: 'data.tokenAAmount', description: 'Token A amount', category: 'amounts' },
    { name: 'tokenBAmount', path: 'data.tokenBAmount', description: 'Token B amount', category: 'amounts' },
    { name: 'lpAmount', path: 'data.lpAmount', description: 'LP tokens received', category: 'amounts' },
  ],
  'RemoveLiquidity': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'wallet', path: 'data.user', description: 'Wallet that removed liquidity', category: 'accounts' },
    { name: 'tokenAAmount', path: 'data.tokenAAmount', description: 'Token A received', category: 'amounts' },
    { name: 'tokenBAmount', path: 'data.tokenBAmount', description: 'Token B received', category: 'amounts' },
    { name: 'lpAmount', path: 'data.lpAmount', description: 'LP tokens burned', category: 'amounts' },
  ],
  'ClaimFee': [
    { name: 'pool', path: 'data.pool', description: 'Pool address', category: 'accounts' },
    { name: 'wallet', path: 'data.user', description: 'Wallet that claimed fees', category: 'accounts' },
    { name: 'feeAmount', path: 'data.feeAmount', description: 'Fee amount claimed', category: 'amounts' },
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
    setSelectedPrograms(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
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

      await createPipeline({
        name: name || undefined,
        programs: selectedPrograms,
        filter: selectedEvents.length > 0 ? { instructions: selectedEvents } : {},
        transform: { mode: 'fields', fields },
        destinations,
      });

      router.push('/pipelines');
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
        return true;
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
                      className={`p-4 rounded-lg border text-left transition-colors ${
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
            <Card>
              <CardHeader>
                <h2 className="font-semibold">Filter Events</h2>
                <p className="text-sm text-[var(--muted)] mt-1">
                  Select which events to include (leave empty for all)
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
                            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
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
                {selectedEvents.length === 0 && (
                  <p className="text-sm text-[var(--muted)] mt-4">
                    All events will be included
                  </p>
                )}
              </CardContent>
            </Card>
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
                        className="text-xs text-[var(--accent)] hover:underline"
                      >
                        Select all
                      </button>
                      <span className="text-[var(--muted)]">|</span>
                      <button
                        onClick={clearAllFields}
                        className="text-xs text-[var(--muted)] hover:underline"
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
                              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
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
                    className={`w-10 h-6 rounded-full transition-colors ${
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
