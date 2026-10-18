# 킷 개발 지침

- 킷의 구조·기능·공개 계약을 변경할 때 [SDK 헥사고날 설계](docs/architecture.md)와 [조립 규약](docs/kit-contract.md)을 먼저 읽는다. 앱이 공개 유스케이스를 호출하고, 킷의 실행 범위는 명시적인 SDK 호출에 한정한다.
- 마켓 연동을 변경할 때 [API 명세 관리 기준](kits/marketplace/specs/README.md)과 해당 연동처의 명세·매핑·fixture를 함께 확인한다.
- 검증 명령과 실행 환경은 루트 `package.json`과 `.github/workflows/ci.yml`을 기준으로 한다. 내부 구조 변경 후 실제 패키지 소비 검증까지 수행한다.
