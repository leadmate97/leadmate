import { NextResponse } from "next/server";

function prefix(value: string | undefined) {
  if (!value) return "missing";
  if (value.startsWith("test_ck_")) return "test_client";
  if (value.startsWith("live_ck_") || value.startsWith("ck_live_")) return "live_client";
  if (value.startsWith("test_sk_")) return "test_secret";
  if (value.startsWith("live_sk_") || value.startsWith("sk_live_")) return "live_secret";
  if (value.startsWith("eyJ")) return "jwt";
  if (value.startsWith("sb_secret_")) return "supabase_secret";
  if (value.startsWith("sb_publishable_")) return "supabase_publishable";
  return "present";
}

export async function GET() {
  const tossClient = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
  const tossSecret = process.env.TOSS_SECRET_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cronSecret = process.env.CRON_SECRET;

  const clientPrefix = prefix(tossClient);
  const secretPrefix = prefix(tossSecret);
  const servicePrefix = prefix(serviceRole);
  const cronPrefix = prefix(cronSecret);

  const tossPairMatches =
    (clientPrefix === "test_client" && secretPrefix === "test_secret") ||
    (clientPrefix === "live_client" && secretPrefix === "live_secret");

  const warnings: string[] = [];

  if (!tossClient) warnings.push("NEXT_PUBLIC_TOSS_CLIENT_KEY가 없습니다.");
  if (!tossSecret) warnings.push("TOSS_SECRET_KEY가 없습니다.");
  if (!serviceRole) warnings.push("SUPABASE_SERVICE_ROLE_KEY가 없습니다.");
  if (!cronSecret) warnings.push("CRON_SECRET가 없습니다.");

  if (tossClient && tossSecret && !tossPairMatches) {
    warnings.push("Toss Client Key와 Secret Key의 테스트/라이브 환경이 서로 다릅니다.");
  }

  if (cronSecret && ["test_secret", "live_secret"].includes(cronPrefix)) {
    warnings.push("CRON_SECRET에 Toss Secret Key처럼 보이는 값이 들어가 있습니다. 별도 랜덤 문자열을 사용하세요.");
  }

  if (serviceRole && servicePrefix === "supabase_publishable") {
    warnings.push("SUPABASE_SERVICE_ROLE_KEY에 publishable key가 들어가 있습니다. 서버 전용 service_role/secret key를 사용하세요.");
  }

  return NextResponse.json({
    configured: Boolean(tossClient && tossSecret && serviceRole),
    checks: {
      tossClientKey: Boolean(tossClient),
      tossSecretKey: Boolean(tossSecret),
      supabaseServiceRoleKey: Boolean(serviceRole),
      cronSecret: Boolean(cronSecret),
      tossPairMatches
    },
    keyTypes: {
      tossClient: clientPrefix,
      tossSecret: secretPrefix,
      supabaseServiceRole: servicePrefix,
      cronSecret: cronPrefix
    },
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
    warnings
  });
}
