# Social login setup

The application delegates identity verification to Supabase and retains first-party, HttpOnly game sessions. Enable each provider in Supabase before adding its website name to `AUTH_PROVIDERS`.

## Provider mapping

| Website name | Supabase provider | Current application |
| --- | --- | --- |
| x | x | Existing X OAuth 2.0 configuration |
| facebook | facebook | Meta app 1125720033691224 |
| kakao | custom:kakao | Kakao app 1629099 |
| line | custom:line | LINE Login channel 2012290872 |

Provider client secrets belong in Supabase, never source control or frontend configuration. Existing LINE LIFF and Kakao JavaScript share keys do not configure account login.

For this project the provider callback is `https://aorxdxhcxzcvjqfldtov.supabase.co/auth/v1/callback`. The application then receives the Supabase PKCE callback at `/api/auth/callback`, with a single-use state bound to the originating game session.

## LINE

Use a custom provider identified as `custom:line` and display name `LINE`. The website accepts only `line` and maps it internally; arbitrary custom providers are rejected.

- Authorization: `https://access.line.me/oauth2/v2.1/authorize`
- Token: `https://api.line.me/oauth2/v2.1/token`
- Userinfo: `https://api.line.me/oauth2/v2.1/userinfo`
- Scopes: `openid,profile`
- Allow sign-in without an email; this channel has no email permission.
- Keep PKCE enabled.

Prefer the custom OAuth2 userinfo flow. LINE web-login ID tokens use HS256 signed with the channel secret; do not assume a generic JWKS-only OIDC configuration will validate them. Verify the dashboard provider type and a real callback before enabling the public button.

References: [Supabase custom providers](https://supabase.com/docs/guides/auth/custom-oauth-providers), [LINE Login API](https://developers.line.biz/en/reference/line-login/), [LINE ID tokens](https://developers.line.biz/en/docs/line-login/verify-id-token/).

## Kakao

Register the callback on the existing REST API key and preserve its enabled client-secret protection. Enable Kakao Login and OpenID Connect. Configure custom:kakao with OIDC issuer https://kauth.kakao.com, the existing REST key/client secret, scopes openid,profile_nickname,profile_image, and allow users without email. Keep PKCE and nonce verification enabled. The built-in Kakao provider was disabled because its observed authorization redirect hardcodes account_email even with email optional; this app has no account-email permission.

Reference: [Supabase Kakao setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-kakao).

## Rollout status (2026-10-30)

Provider callbacks saved; Facebook email permission added (ready for testing). Supabase Facebook, custom:line (OAuth2), and custom:kakao (OIDC) configured and enabled. Kakao Login and OIDC enabled on the app. Built-in Kakao disabled to avoid its unwanted email scope. Public Facebook access remains blocked by unpublished status and missing app icon, privacy policy URL, user deletion instructions and category. Real end-to-end login remains to be verified; provider redirect checks are not full account acceptance.
