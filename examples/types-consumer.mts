import type {
  MarketplaceReader,
  OrderPage,
} from "@kimyongin/marketplace-kit/types";
import { createCoupangClient } from "@kimyongin/marketplace-kit/coupang";
import { createNaverClient } from "@kimyongin/marketplace-kit/naver";

const coupang: MarketplaceReader = createCoupangClient({
  connectionId: "typed-coupang",
  vendorId: "A00000001",
  orderStatus: "ACCEPT",
  credentials: async () => ({ accessKey: "synthetic", secretKey: "synthetic" }),
});
const naver: MarketplaceReader = createNaverClient({
  connectionId: "typed-naver",
  credentials: async () => ({
    clientId: "synthetic",
    clientSecret: "$2a$10$abcdefghijklmnopqrstuv",
    type: "SELF",
  }),
});
export const readers = [coupang, naver];
export type ReadResult = OrderPage;
