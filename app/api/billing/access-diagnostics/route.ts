import { NextRequest, NextResponse } from "next/server";
import { createClient as createUserClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ ok: false, code: "BUSINESS_ID_REQUIRED", error: "businessId가 필요합니다." }, { status: 400 });
  }

  const result: any = {
    ok: false,
    authUser: false,
    userMembership: false,
    userRole: null,
    serviceRoleConnection: false,
    subscriptionFound: false,
    code: null,
    error: null
  };

  try {
    const userClient = await createUserClient();
    const { data: { user }, error: userError } = await userClient.auth.getUser();

    if (userError) {
      result.code = "AUTH_GET_USER_FAILED";
      result.error = userError.message;
      return NextResponse.json(result);
    }
    if (!user) {
      result.code = "AUTH_REQUIRED";
      result.error = "로그인 세션이 없습니다.";
      return NextResponse.json(result);
    }

    result.authUser = true;

    const { data: member, error: memberError } = await userClient
      .from("business_members")
      .select("role")
      .eq("business_id", businessId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError) {
      result.code = "BUSINESS_MEMBER_QUERY_FAILED";
      result.error = memberError.message;
      return NextResponse.json(result);
    }

    if (!member) {
      result.code = "BUSINESS_MEMBER_NOT_FOUND";
      result.error = "현재 사용자와 businessId가 business_members에서 연결되지 않았습니다.";
      return NextResponse.json(result);
    }

    result.userMembership = true;
    result.userRole = member.role;

    try {
      const admin = createAdminClient();
      const { data: sub, error: subError } = await admin
        .from("business_subscriptions")
        .select("business_id")
        .eq("business_id", businessId)
        .maybeSingle();

      if (subError) {
        result.code = subError.code || "SERVICE_ROLE_QUERY_FAILED";
        result.error = subError.message;
        return NextResponse.json(result);
      }

      result.serviceRoleConnection = true;
      result.subscriptionFound = Boolean(sub);
      result.ok = true;
      return NextResponse.json(result);
    } catch (error: any) {
      result.code = error?.code || "SERVICE_ROLE_FAILED";
      result.error = error?.message || "Supabase 서버키 연결에 실패했습니다.";
      return NextResponse.json(result);
    }
  } catch (error: any) {
    result.code = error?.code || "ACCESS_DIAGNOSTIC_FAILED";
    result.error = error?.message || "접근 진단에 실패했습니다.";
    return NextResponse.json(result);
  }
}
