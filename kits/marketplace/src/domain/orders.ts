/** This entry point contains types only and is safe for browser type imports. */
export type Market = "coupang" | "naver";
export interface Money {
  readonly currency: string;
  /** Exact decimal text, never a floating-point calculation. */
  readonly amount: string;
}

export interface OrderLine {
  readonly id: string;
  readonly productId: string;
  readonly optionId?: string;
  readonly title?: string;
  readonly quantity: number;
  readonly cancelledQuantity?: number;
  readonly pendingCancellationQuantity?: number;
  readonly unitPrice?: Money;
  readonly paidAmount?: Money;
}

export interface OrderSnapshot {
  readonly ref: {
    readonly market: Market;
    readonly connectionId: string;
    readonly kind: "shipment" | "productOrder";
    readonly id: string;
  };
  readonly orderId: string;
  readonly placedAt: string;
  readonly rawStatus: string;
  readonly fulfillment:
    | "pending"
    | "preparing"
    | "dispatchRequested"
    | "shipped"
    | "delivered"
    | "unknown";
  readonly lines: readonly OrderLine[];
}

export interface OrderPage {
  readonly items: readonly OrderSnapshot[];
  readonly nextCursor: string | null;
  readonly observedAt: string;
  readonly coverage: {
    readonly kind: "changedWindow" | "statusWindow";
    readonly from: string;
    readonly to: string;
    readonly status?: string;
  };
}
