# agent-workspace-kit

업무별 킷과 `agent-workspace-template`에서 사용하는 조립 규약을 관리합니다. 첫 marketplace 킷은 쿠팡·네이버 주문 읽기를 제공합니다. 실제 판매자 계정 호출과 나머지 마켓·쓰기 기능은 후속 검증·구현 범위입니다.

## 킷 사용과 개발

- [Marketplace 사용법과 검증](kits/marketplace/README.md)
- [공통 킷 조립 규약](docs/kit-contract.md)
- [SDK 헥사고날 설계와 개발 지침](docs/architecture.md)
- [모든 킷의 공개 유스케이스와 mock 규약](docs/mock-contract.md)

Node 22와 Deno 2.9.6을 준비하고 `npm ci --ignore-scripts`, `npm run check`, `npm test`, `npm run verify:package` 순서로 실행합니다. registry 공개 없이 실제 패키지 산출물을 소비하는 예제로 검증합니다.

## Marketplace 문서

| 문서 | 내용 |
| --- | --- |
| [쿠팡과 네이버 API 조사](kits/marketplace/docs/research/coupang-naver-commerce-apis.md) | 인증·업무 범위·호출 제한·운영 제약 |
| [G마켓과 옥션 및 11번가 API 조사](kits/marketplace/docs/research/gmarket-auction-11st-open-apis.md) | ESM·11번가 지원 범위와 미확인 계약 |
| [초기 통합 설계안](kits/marketplace/docs/design/marketplace-integration-design.md) | 공통 모델·동기화·외부 작업 처리 |
| [API 명세 관리 기준](kits/marketplace/specs/README.md) | 공식 출처·검증 계약·매핑·예제·변경 관리 |

킷과 호스트의 책임 분리 및 후속 작업은 [설계 이슈 #1](https://github.com/kimyongin/agent-workspace-kit/issues/1)에서 관리합니다. 공식 API의 현재 동작은 각 연동처 원문과 실제 계정 권한을 확인해야 하며, 조사 문서가 최신 명세를 대신하지 않습니다.
