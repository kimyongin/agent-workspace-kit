# agent-workspace-kit

업무별 킷과 `agent-workspace-template`에서 사용하는 조립 규약을 관리합니다. 현재는 marketplace 킷의 조사·설계 단계이며 실행 라이브러리는 아직 구현하지 않았습니다.

## Marketplace 문서

| 문서 | 내용 |
| --- | --- |
| [쿠팡과 네이버 API 조사](kits/marketplace/docs/research/coupang-naver-commerce-apis.md) | 인증·업무 범위·호출 제한·운영 제약 |
| [G마켓과 옥션 및 11번가 API 조사](kits/marketplace/docs/research/gmarket-auction-11st-open-apis.md) | ESM·11번가 지원 범위와 미확인 계약 |
| [초기 통합 설계안](kits/marketplace/docs/design/marketplace-integration-design.md) | 공통 모델·동기화·외부 작업 처리 |
| [API 명세 관리 기준](kits/marketplace/specs/README.md) | 공식 출처·검증 계약·매핑·예제·변경 관리 |

킷과 호스트의 책임 분리 및 후속 작업은 [설계 이슈 #1](https://github.com/kimyongin/agent-workspace-kit/issues/1)에서 관리합니다. 공식 API의 현재 동작은 각 연동처 원문과 실제 계정 권한을 확인해야 하며, 조사 문서가 최신 명세를 대신하지 않습니다.
