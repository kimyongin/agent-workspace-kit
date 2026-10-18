# Marketplace kit

쿠팡·네이버 주문 읽기를 제공하는 서버용 TypeScript/ESM 라이브러리다. 현재 구현은 합성 HTTP 응답으로 인증·요청·정규화를 검증했으며 실제 판매자 계정으로 호출하지 않았다. G마켓·옥션·11번가, 독립 클레임 수집, 상품·정산·송장·재고 변경은 아직 제공하지 않는다.

## 공개 Interface

```ts
import { createCoupangClient } from "@kimyongin/marketplace-kit/coupang";
import type { OrderPage } from "@kimyongin/marketplace-kit/types";

const reader = createCoupangClient({
  connectionId: "my-coupang-store",
  vendorId: "A00000001",
  orderStatus: "ACCEPT",
  credentials: async () => ({ accessKey, secretKey }),
  beforeRequest: async (scope, signal) => {
    await requestGate.wait(scope.buckets, { signal });
  },
});

const page: OrderPage = await reader.readOrders({
  from: "2026-10-18T00:00+09:00",
  to: "2026-10-18T01:00+09:00",
});
// Host-provided single transaction; do not advance the checkpoint first.
await store.commit({ records: page.items, cursor: page.nextCursor });
```

`accessKey`, `secretKey`, `requestGate`, `store`는 호스트가 제공하는 값이며 SDK가 전역으로 설치하는 객체가 아니다. `fetch`, `now`, `beforeRequest`, `timeoutMs`를 선택적으로 주입한다. 인증과 요청 구성은 SDK가 수행하고 권한·비밀 저장·분산 제한·영속 저장은 호스트가 담당한다. import와 factory 생성에는 외부 부수효과가 없다.

네이버는 `createNaverClient({ connectionId, credentials })`를 사용한다. resolver는 `clientId`, bcrypt salt 형식의 `clientSecret`, `type: "SELF" | "SELLER"`를 반환한다. SELLER는 `accountId`가 필요하다. 현재 계정과 조회조건에 묶인 다음 커서를 원래 `from`·`to`와 함께 전달한다. 인증 오류 시 토큰 갱신 재시도는 한 번으로 제한한다. 실제 판매자·솔루션 권한은 별도로 확보해야 한다.

## 조회 의미와 제약

| 구현 | 지원 범위 |
| --- | --- |
| 쿠팡 | v5 발주서 분단위 전체 조회. 같은 KST 날짜의 24시간 미만 구간, `yyyy-MM-ddTHH:mm+09:00` 형식. 한 클라이언트에 조회 status 지정 |
| 네이버 | 최대 24시간 변경 상품주문 내역과 해당 페이지의 상세 조회. 한 페이지 최대 300건, 동일 시각의 moreSequence 보존 |

쿠팡 분단위 API의 페이징 요청 계약은 확인되지 않아 `nextToken`이 있는 응답은 불완전 응답 오류로 반환한다. 임의로 다음 페이지를 요청하거나 완료로 표시하지 않는다. 쿠팡 반품완료 등은 별도 API가 필요하다. 네이버 상세가 요청 ID와 일치하지 않으면 빈 상세·삭제로 해석하지 않고 해당 페이지를 실패시킨다.

`OrderSnapshot.ref`는 쿠팡의 배송단위와 네이버의 상품주문단위를 구분한다. 같은 orderId가 여러 snapshot에 나타날 수 있으므로 orderId 하나로 덮어쓰지 않는다. ID는 문자열이며 JSON 파싱부터 정밀도를 보존한다. 금액은 부동소수점 대신 통화와 정확한 10진 문자열이다. 원본 상태는 보존하고 알 수 없는 상태는 `unknown`으로 표시한다. 배송지·고객 연락처·원문 payload는 반환하지 않는다. 현재 결과만으로 출고나 환불을 결정해서는 안 된다.

## 패키지 소비와 검증

루트에서 다음을 실행한다.

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run verify:package
```

`npm test`와 `verify:package`는 이전 산출물을 지우고 현재 소스를 빌드한다. 검증은 패키지를 `.artifacts`에 포장하고 SHA-256을 기록한 뒤, 별도 임시 프로젝트에 tarball로 설치해 공개 exports·타입·실행을 Node 22와 Deno 2.9.6에서 확인한다. Deno가 PATH에 없으면 `DENO_BIN`으로 바이너리를 지정한다. 소비 예제는 실제 네트워크나 키 없이 정본 합성 fixture를 사용한다. SDK 소스나 템플릿 내부 경로를 직접 import하지 않는다.

저장소는 공개이며 npm registry에는 아직 배포하지 않는다. 패키지의 `private: true`는 의도하지 않은 npm 배포를 방지하기 위해 유지한다. 소비자는 GitHub CI artifact 또는 직접 빌드한 tarball과 해시를 받아 `npm install ./marketplace.tgz`로 설치할 수 있다. 설치된 의존성을 Deno에서 사용할 때는 `nodeModulesDir: "manual"`을 설정한다. 최초 설치에는 공개 런타임 의존성 다운로드가 필요하다. CI artifact의 접근 권한과 보관 수명은 호스트 운영 정책으로 관리한다.

## 계약과 검증 근거

- [공통 킷 조립 규약](https://github.com/kimyongin/agent-workspace-kit/blob/main/docs/kit-contract.md)
- [API 명세 관리 기준](https://github.com/kimyongin/agent-workspace-kit/blob/main/kits/marketplace/specs/README.md)
- [쿠팡 주문 계약과 매핑](https://github.com/kimyongin/agent-workspace-kit/blob/main/kits/marketplace/specs/coupang/orders.md)
- [네이버 주문 계약과 매핑](https://github.com/kimyongin/agent-workspace-kit/blob/main/kits/marketplace/specs/naver/read-orders.md)
- [첫 구현 이슈 #3](https://github.com/kimyongin/agent-workspace-kit/issues/3)

라이브러리 테스트와 실제 마켓 계정 검증, Deno 실행과 Supabase 배포 검증은 구분한다. 현재 구현은 후자의 운영 검증을 완료하지 않았다.
