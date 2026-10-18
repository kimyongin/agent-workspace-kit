# Naver order reader contract

Verified 2026-10-18 against Commerce API **2.90.1 (2026-10-07)**. Public documentation only; no seller credentials or live API used.

Primary sources:

- [Authentication and independent bcrypt example](https://apicenter.commerce.naver.com/docs/auth)
- [Token endpoint](https://apicenter.commerce.naver.com/docs/commerce-api/current/exchange-sellers-auth)
- [Changed orders](https://apicenter.commerce.naver.com/docs/commerce-api/current/seller-get-last-changed-status-pay-order-seller)
- [Detail query](https://apicenter.commerce.naver.com/docs/commerce-api/current/seller-get-product-orders-pay-order-seller)
- [Full nested order schema](https://apicenter.commerce.naver.com/docs/commerce-api/current/schemas/상품-주문-정보-구조체)
- [Change record schema](https://apicenter.commerce.naver.com/docs/commerce-api/current/schemas/변경-상품-주문-정보-구조체)

The endpoint summaries omit nested properties; mapping below was checked against the separate full nested schema, not inferred from endpoint names.

| Provider field | SDK field | Meaning |
| --- | --- | --- |
| productOrder.productOrderId | ref.id, lines[0].id | One snapshot per product order |
| order.orderId | orderId | Parent order identifier |
| order.orderDate | placedAt | Order date, not payment/change date |
| productOrder.productId | lines[0].productId | Channel product identifier |
| productOrder.productName | lines[0].title | Optional product title |
| productOrder.quantity | lines[0].quantity | Original ordered quantity |
| productOrder.unitPrice | lines[0].unitPrice | Product price in KRW; not option-adjusted or calculated |
| productOrder.totalPaymentAmount | lines[0].paidAmount | Original paid amount after discounts; not remaining amount |
| productOrder.productOrderStatus | rawStatus, fulfillment | PAYMENT_WAITING=pending, PAYED=preparing, DELIVERING=shipped, DELIVERED/PURCHASE_DECIDED=delivered; all other states=unknown |

Only the listed fields are returned. Buyer, recipient, address, phone, customs and raw provider records are excluded.

Changed-window requests are bounded to 24 hours and 300 records. The provider documents time and product-order-id ordering. Continue using the exact `moreFrom`/`moreSequence` strings and preserve the original end timestamp. Cursor scope includes marketplace, connection, original window, client id, token type and seller account; secrets are not serialized. Cursors are opaque continuation hints, not signed authorization tokens. Provider continuation sequences are bounded to 1024 characters without controls, timestamps must be valid timezone-qualified ISO values, and encoded cursors are capped at 16 KiB. An empty change page with a continuation or a repeated same-instant/same-sequence position is rejected rather than creating an endless poll. Order dates receive the same ISO/calendar validation.

Detail POST queries send the returned product-order identifiers (maximum 300). Missing, duplicate and unrequested detail identifiers reject the whole page so the host cannot mistakenly commit a next cursor. Empty change pages skip detail lookup. Unknown statuses retain their source string. Numeric JSON values are read losslessly by the shared transport and prices retain decimal text; documented Naver price fields are integer KRW amounts.

Token requests use client credentials, form encoding, bcrypt(clientId_timestamp, clientSecret), then Base64 of the resulting ASCII hash. Token caches and issuance singleflight are local to one client instance and keyed by the full credential context, including rotation. Issuance starts only during a read and has an independent bounded timeout; each waiter can cancel its own read without cancelling another waiter or the shared issuance. An issuance already started may complete and populate the local cache after all its current waiters cancel.

Credential validation rejects supplied accountId in SELF mode; SELLER requires a nonempty accountId of at most 256 characters without controls or surrounding whitespace. Client identifiers have the same identity validation and a UTF-8 byte limit of 58 to reserve 14 bytes for the separator and current millisecond timestamp; the complete password is checked against bcrypt's 72-byte limit before signing. Supported bcrypt salt costs are 04–12, intentionally bounded to avoid unbounded CPU work from a credentials resolver. Unsupported inputs fail with a safe configuration error before network use.

Request coordination exposes distinct application and application-operation buckets shared across connections with the same clientId. SELLER additionally exposes seller and seller-operation buckets shared across applications with the same accountId. SELF lacks an explicit seller identity, so its resource buckets are bound to the clientId; hosts needing to unify SELF with a separately delegated seller context must map that identity in their own coordinator. Buckets are unambiguous JSON tuples and include no secrets. They are coordination hints and do not implement locking, rate limits, or distributed token sharing.

The SDK makes at most one authentication retry following API HTTP 401. It applies this bounded retry to all 401 responses because the shared transport intentionally discards provider response bodies; the official guide specifically recommends fallback for `GW.AUTHN`. Other provider errors are returned without automatic retries or raw error bodies. Rate limiting and persistence remain host responsibilities.

Synthetic fixture version: **1**, aligned to the above documentation version. `naver-changes.json` and `naver-details.json` contain invented identifiers beyond JS safe-integer range and large integer amounts, with private marker fields to verify exclusion. They are not recorded seller responses. Tests use the official published bcrypt input/output vector independently of the implementation.

Known limits: order reads do not constitute claim reconciliation; quantity-claim compatibility is not enabled. Original quantity/payment are not current remaining values. A changed-window poll is not a historical completeness guarantee, and a cursor must be committed atomically with its page by the host. No live authorization or seller-account integration has been exercised.

## Fixture and test links

- [Changed orders fixture](../../tests/fixtures/naver-changes.json)
- [Order details fixture](../../tests/fixtures/naver-details.json)
- [Public reader tests](../../tests/naver.test.mjs)

## Contract changes

- 2026-10-18: first internal order-reader contract and synthetic fixture version 1. Only a paraphrase is stored; official raw document redistribution rights have not been established and no raw document is copied. Actual seller-account verification remains pending.
