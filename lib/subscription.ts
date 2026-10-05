export type PlanCode = "personal" | "team";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

export type PlanDefinition = {
  code: PlanCode;
  name: string;
  priceMonthly: number;
  customerLimit: number;
  memberLimit: number;
  recommended?: boolean;
  features: string[];
};

export const TRIAL_DAYS = 7;
export const NEW_USER_REFERRAL_DISCOUNT = 10000;
export const REFERRER_CREDIT = 5000;

// 초기 프로젝트 구독 기준입니다. 실제 결제 연동 시 PG 상품 가격과 동일하게 맞춥니다.
export const PLAN_CATALOG: PlanDefinition[] = [
  {
    code: "personal",
    name: "개인형",
    priceMonthly: 39000,
    customerLimit: 5000,
    memberLimit: 1,
    recommended: true,
    features: [
      "고객/상담/재연락 관리",
      "업종 맞춤 영업 단계",
      "사용자 정의 고객 항목",
      "영업 통계",
      "지인 ID 입력 시 첫 구독 10,000원 할인"
    ]
  },
  {
    code: "team",
    name: "팀 · 사업장형",
    priceMonthly: 159000,
    customerLimit: 50000,
    memberLimit: 20,
    features: [
      "개인형 전체 기능",
      "최대 20명 팀 사용",
      "팀 권한/담당자 기능 예정",
      "팀 단위 리포트 예정",
      "사업장 단위 고객 관리"
    ]
  }
];

export function getPlan(code?: string | null) {
  return PLAN_CATALOG.find((p) => p.code === code) ?? PLAN_CATALOG[0];
}

export function formatWon(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

export function daysRemaining(value?: string | null) {
  if (!value) return 0;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86400000));
}
