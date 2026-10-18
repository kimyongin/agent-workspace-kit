# Coupang read-only orders contract

Verified 2026-10-18 against [official minute orders documentation](https://developers.coupang.com/ko/api/shipments/po-list-query-by-minute), document ID **2609170000**, API **v5**; authentication against [official HMAC guide](https://developers.coupang.com/ko/getting-started/creating-hmac-signature). This is a paraphrased implementation contract, not a copy of the examples. No seller account or live API was accessed.

## Request and limits

`GET https://api-gateway.coupang.com/v2/providers/openapi/apis/api/v5/vendors/{vendorId}/ordersheets` uses `createdAtFrom`, `createdAtTo`, `searchType=timeFrame`, and required `status`. Supported configured statuses: ACCEPT, INSTRUCT, DEPARTURE, DELIVERING, FINAL_DELIVERY, NONE_TRACKING. SDK inputs must be minute timestamps with `+09:00`, increasing within one KST date and shorter than 24 hours.

The response documents `nextToken` but minute requests do not document token input. SDK rejects any nonempty or missing token and all supplied cursors. It cannot assert complete coverage otherwise. Boundaries are unspecified. This status window is not a change feed; returned orders exclude completed returns. The host owns overlap, deduplication, polling and reconciliation.

## Mapping

| Provider field | SDK field |
| --- | --- |
| shipmentBoxId | ref.id, kind=shipment |
| orderId / orderedAt / status | orderId / placedAt / rawStatus |
| sequenceNo | line.id |
| sellerProductId / vendorItemId | productId / optionId |
| vendorItemName | title |
| shippingCount / cancelCount / holdCountForCancel | quantity / cancelledQuantity / pendingCancellationQuantity |
| salesPrice / orderPrice | unitPrice / paidAmount |

Money objects use currencyCode plus exact BigInt units/nanos arithmetic; null prices are omitted. IDs remain decimal text without Number conversion. No buyer, receiver, customs, delivery-address or raw response fields are returned. SDK interpretation: ACCEPT→pending, INSTRUCT→preparing, DEPARTURE→dispatchRequested, DELIVERING→shipped, FINAL_DELIVERY→delivered; other states→unknown.

## Signing and fixture reproduction

HMAC-SHA256 signs UTC `yyMMddTHHmmssZ` + `GET` + path + the transmitted encoded query without `?`. Authorization uses CEA algorithm/access-key/signed-date/signature parameters. Credentials and time are resolved after host coordination; secrets and response bodies are excluded from errors. The SDK fixes the production HTTPS host and disables redirects. KR market and JSON headers are sent.

[Fixture](../../tests/fixtures/coupang-orders.json) is manually authored synthetic v5 data with no personal information. It exercises integers above 2^53, nine-digit fractional nanos, distinct order/shipment IDs and raw cancellation quantities. Field shapes come from the linked document, not real traffic. [Public seam tests](../../tests/coupang.test.mjs) independently check signing with Node's HMAC implementation, exact values, limits and failure behavior.

Reproduce on Node 22+: `npm run build` then `node --test kits/marketplace/tests/coupang.test.mjs`. No keys or network are needed. Live response compatibility remains unverified.

## Contract changes

- 2026-10-18: first internal v5 minute-reader contract and synthetic fixture version 1. Only a paraphrase is stored; official raw document redistribution rights have not been established and no raw document is copied. Actual seller-account verification remains pending.
