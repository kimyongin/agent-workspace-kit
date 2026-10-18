import type {
  OrderPage,
  ReadOrdersQuery,
  ReadOrdersUseCase,
} from "@kimyongin/marketplace-kit/types";
import { createCoupangReadOrders } from "@kimyongin/marketplace-kit/coupang";
import { createNaverReadOrders } from "@kimyongin/marketplace-kit/naver";
import {
  createMockReadOrders,
  createOrderFixtures,
} from "@kimyongin/marketplace-kit/testing";
import type {
  OrderLine,
  OrderSnapshot,
} from "@kimyongin/marketplace-kit/types";

const coupang: ReadOrdersUseCase = createCoupangReadOrders({
  connectionId: "typed-coupang",
  vendorId: "A00000001",
  orderStatus: "ACCEPT",
  credentials: async () => ({ accessKey: "synthetic", secretKey: "synthetic" }),
});
const naver: ReadOrdersUseCase = createNaverReadOrders({
  connectionId: "typed-naver",
  credentials: async () => ({
    clientId: "synthetic",
    clientSecret: "$2a$10$abcdefghijklmnopqrstuv",
    type: "SELF",
  }),
});
const request = {
  from: "2026-10-18T00:00+09:00",
  to: "2026-10-18T01:00+09:00",
};
const page: Awaited<ReturnType<ReadOrdersUseCase["execute"]>> = {
  items: [],
  observedAt: "2026-10-18T03:00:00Z",
  nextCursor: null,
  coverage: { kind: "changedWindow", ...request },
};
const mock: ReadOrdersUseCase = createMockReadOrders({
  market: "naver",
  scenarios: [{ request, result: page }],
});
const fixtures = createOrderFixtures({
  ...request,
  market: "naver",
  connectionId: "typed-fixtures",
});
const builtLine: OrderLine = fixtures.line({
  title: "Typed item",
  quantity: 2,
});
const builtOrder: OrderSnapshot = fixtures.order({ lines: [builtLine] });
export const builtPage: OrderPage = fixtures.page({ items: [builtOrder] });
export const useCases = [coupang, naver, mock];
export function loadOrders(
  orders: ReadOrdersUseCase,
  query: ReadOrdersQuery,
): Promise<OrderPage> {
  return orders.execute(query);
}
export type ReadResult = OrderPage;
