# CHANGELOG

## V2.4.5.1
- 존재하지 않는 subscription_overrides/app_admins 등으로 권한 migration이 실패하는 문제 수정
- to_regclass()로 실제 존재하는 테이블에만 service_role grant 적용
- schema_version 테이블이 없어도 migration이 실패하지 않도록 보강
