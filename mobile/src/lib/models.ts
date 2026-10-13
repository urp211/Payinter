/** API payload typings (matches backend v1 responses). */

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

export interface Profile {
  id: string;
  email: string;
  paytag: string;
  status: string;
  countryCode: string;
  emailVerified: boolean;
  hasPin: boolean;
  firstName?: string;
  lastName?: string;
  profile?: unknown;
  kyc?: { status?: string; level?: string; [k: string]: unknown } | null;
  createdAt?: string;
}

export interface Balance {
  currency: string;
  symbol: string;
  name: string;
  decimals: number;
  availableMinor: number;
  pendingMinor: number;
  usdEquivalentMinor: number;
}

export interface Wallet {
  walletId: string;
  totalUsdMinor: number;
  balances: Balance[];
  syncedAt?: string;
}

export interface TxItem {
  id: string;
  reference: string;
  type: string;
  status: string;
  amountMinor: number;
  currency: string;
  feeMinor?: number;
  exchangeRate?: string | null;
  netAmountMinor?: number | null;
  description?: string;
  note?: string | null;
  counterpartyName?: string | null;
  counterpartyRef?: string | null;
  paymentProvider?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  refundedAmountMinor?: number;
  trackingStatus?: string | null;
  trackingEvents?: { status: string; at: string; note?: string }[];
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
  /** local-only: written offline and awaiting flush */
  offlineQueued?: boolean;
}

export interface TxDetail extends TxItem {
  legs?: { account_code?: string; currency?: string; amount_minor?: number; direction?: string }[];
  timeline?: { event: string; at: string }[];
}

export interface Card {
  id: string;
  kind: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  status: string;
  isDefault: boolean;
  label?: string;
  createdAt?: string;
}

export interface Recipient {
  id: string;
  type: string;
  fullName: string;
  nickname?: string;
  countryCode?: string;
  currency: string;
  details: Record<string, unknown>;
  isFavorite?: boolean;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body?: string;
  read?: boolean;
  read_at?: string | null;
  created_at?: string;
  createdAt?: string;
}

export interface Ticket {
  id: string;
  subject: string;
  status?: string;
  priority?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CurrencyMeta {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  is_active?: boolean;
  supports_topup?: boolean;
}
