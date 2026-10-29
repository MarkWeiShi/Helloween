# SNS sharing for helloween.fly.dev

The share icon and Trick button open the same channel picker. Choosing a channel creates an invitation, then shows the provider's next step. Creating/opening a link is never reported as successful sharing or authorization.

## First phase: LINE and Facebook Messenger

Add to `~/Projects/.env` (preserving existing keys):

```dotenv
PUBLIC_ORIGIN=https://helloween.fly.dev
FACEBOOK_APP_ID=your_numeric_meta_app_id
```

LINE URL sharing needs no LINE app, Channel ID, Channel Secret, access token or Login/OAuth configuration. It opens LINE's recipient picker on supported devices.

For Messenger, open Meta for Developers, select/create the web app and copy its numeric App ID from basic settings. Configure the app domain `helloween.fly.dev` and website URL `https://helloween.fly.dev/`. Do not put App Secret, a Page token or a personal access token into these frontend-sharing settings. Desktop integration uses Send Dialog (pending live verification with this app); mobile uses the OS share sheet, where the user selects Messenger if installed, or copies the link. The UI does not pretend that a Facebook timeline post is a Messenger conversation. Complete app review/live-mode requirements shown by Meta before testing with accounts outside app roles.

X Web Intent handles platform login and final confirmation. No automatic posting permission or contacts access is requested.

## KakaoTalk

1. In the existing Kakao Developers app, register the Web platform site domain `https://helloween.fly.dev`.
2. Put the JavaScript key in `KAKAO_JAVASCRIPT_KEY`. Do not use the Admin key or REST API secret here.
3. The public key is delivered to the browser; `Kakao.Share.sendDefault` opens the official recipient selector. A separate Kakao Login/contacts grant is not required just to use KakaoTalk Share.
4. Test on a phone with KakaoTalk, confirm a chosen recipient manually, and verify the received invitation opens.

## WeChat

1. Use the existing certified official account with JS-SDK sharing permissions. Add `helloween.fly.dev` as a JS API security domain.
2. If WeChat supplies `MP_verify_*.txt`, place the exact supplied file in `public/` and deploy it before completing verification. Do not fabricate this file.
3. Configure server-side `WECHAT_APP_ID` and `WECHAT_APP_SECRET`. Authorize the deployment's outbound IP in the account's API IP allowlist.
4. The server caches access tokens/tickets and signs only URLs on `PUBLIC_ORIGIN`. Secrets and tickets never enter client responses. Errors remain explicit; a failed signature is not treated as authorization.
5. Open the game inside WeChat, pick WeChat, then use the top-right menu to Send to Chat or Share to Moments. JS-SDK sharing metadata configuration is not the webpage OAuth/login flow. Outside WeChat, show instructions and the invitation URL.

Put secrets in the user-authorized `~/Projects/.env`, then import only these named variables into Fly secrets. Keep `PUBLIC_ORIGIN=https://helloween.fly.dev`. Never bundle an App Secret into a Vite environment variable or repository.

## Verification boundary

Local tests cover icon geometry/style parity, channel-specific links, truthful unconfigured guidance, shared Trick/icon flow, signature origin restrictions, caching and secret exclusion. Native app login, domain authorization, approved credentials and actual recipient delivery require the configured provider accounts and human confirmation.

Official references:
- https://developers.line.biz/en/docs/messaging-api/using-line-url-scheme/
- https://developers.facebook.com/docs/sharing/reference/share-dialog/
- https://developers.kakao.com/docs/latest/en/kakaotalk-share/js
- https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/JS-SDK.html
