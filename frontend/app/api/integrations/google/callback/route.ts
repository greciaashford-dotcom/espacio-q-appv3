import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser, canManageSettingsOrUsers } from "@/lib/auth/session";
import {
  getGoogleIntegrationConfigStatus,
  saveGoogleOAuthTokens,
  syncScheduleWithGoogle,
} from "@/lib/integrations/google";
import { prisma } from "@/lib/db/prisma";
import { withDbGuard } from "@/lib/http/db-guard";

const OAUTH_STATE_COOKIE = "espacioq_google_oauth_state";

async function handleGET(request: Request) {
  const url = new URL(request.url);
  const baseUrl = process.env.APP_URL || url.origin;
  const user = await getCurrentUser();

  if (!user || !canManageSettingsOrUsers(user)) {
    return NextResponse.redirect(new URL("/acceso", baseUrl));
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(OAUTH_STATE_COOKIE);

  if (!code || !state || !expectedState) {
    return NextResponse.redirect(
      new URL("/admin/horarios?google_error=invalid_state", baseUrl)
    );
  }

  const a = Buffer.from(state);
  const b = Buffer.from(expectedState);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.redirect(
      new URL("/admin/horarios?google_error=state_mismatch", baseUrl)
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const cfg = getGoogleIntegrationConfigStatus();

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/admin/horarios?google_error=missing_credentials", baseUrl)
    );
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: cfg.redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(
        new URL("/admin/horarios?google_error=token_exchange_failed", baseUrl)
      );
    }

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return NextResponse.redirect(
        new URL("/admin/horarios?google_error=no_access_token", baseUrl)
      );
    }

    await saveGoogleOAuthTokens({
      accessToken: String(tokenData.access_token),
      refreshToken: tokenData.refresh_token ? String(tokenData.refresh_token) : undefined,
      expiresInSec: Number(tokenData.expires_in) || 3600,
      locationId: cfg.businessLocationId ?? undefined,
    });

    await prisma.auditEvent.create({
      data: {
        actorUserId: user.id,
        action: "GOOGLE_BUSINESS_OAUTH_CONNECTED",
        entityType: "IntegrationConnection",
        entityId: "GOOGLE_BUSINESS",
        summary: "Cuenta de Google Business Profile conectada mediante OAuth 2.0.",
      },
    });

    await syncScheduleWithGoogle({ actorUserId: user.id });

    return NextResponse.redirect(
      new URL("/admin/horarios?google_connected=1", baseUrl)
    );
  } catch {
    return NextResponse.redirect(
      new URL("/admin/horarios?google_error=exception", baseUrl)
    );
  }
}

export const GET = withDbGuard(handleGET);
