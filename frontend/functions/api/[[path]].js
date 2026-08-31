// =============================================================================
// /api/* をバックエンド(Render)へ転送する「橋渡し」
// =============================================================================
// これは Cloudflare Pages Functions というCloudflareのAPIサーバー機能です。
// このファイルを置くだけで、Cloudflare が自動的に配置してくれます。
//
// 【ファイル名の意味】
//   functions/api/[[path]].js
//     ・functions/ 配下がAPIとして動く場所
//     ・[[path]] は「/api/ のあとに続く全ての階層」を受け取るという意味
//       /api/analyze     → path = "analyze"
//       /api/foo/bar     → path = "foo/bar"
//
// 【なぜ必要か】
//   1. ブラウザから見て画面もAPIも同じドメインになるので、CORS の設定が不要になる
//   2. バックエンド(Render)のURLをブラウザに見せずに済む
//   3. 合言葉(APP_SECRET)をサーバー側でだけ付与できる
//      （フロントのJSに書くと誰でも読めてしまうため、ここで付けるのが重要）
// =============================================================================

export async function onRequest(context) {
  // context には Cloudflare が用意したものが入っている
  //   request: ブラウザから届いたリクエスト
  //   env    : Cloudflare の管理画面で設定した環境変数
  //   params : URLから取り出した値（今回は [[path]] の中身）
  const { request, env, params } = context;

  // --- 環境変数のチェック -------------------------------------------------
  // 設定漏れのときに原因が分からず悩まないよう、はっきりエラーを返す
  if (!env.BACKEND_URL) {
    return new Response(
      "設定エラー: 環境変数 BACKEND_URL が未設定です",
      { status: 500 }
    );
  }

  // --- 転送先URLの組み立て -----------------------------------------------
  // params.path は配列（例: ["analyze"]）で渡ってくるので "/" でつなぐ
  const path = Array.isArray(params.path)
    ? params.path.join("/")
    : params.path || "";

  // 末尾のスラッシュがあってもなくても動くように正規化する
  const base = env.BACKEND_URL.replace(/\/$/, "");

  // クエリ文字列（?a=1 など）があれば引き継ぐ
  const search = new URL(request.url).search;

  const targetUrl = `${base}/${path}${search}`;

  // --- ヘッダーの引き継ぎ -------------------------------------------------
  const headers = new Headers(request.headers);

  // host はこのCloudflareのドメインを指しているので、転送時は消す
  headers.delete("host");

  // 合言葉を付与する。バックエンドはこれが一致しないと 401 を返す。
  // ＝ Render のURLを直接叩かれても弾ける
  if (env.APP_SECRET) {
    headers.set("X-App-Secret", env.APP_SECRET);
  }

  // --- リクエストの本文（画像データなど）------------------------------------
  // GET / HEAD には本文がない。それ以外は中身を読み取って転送する。
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.arrayBuffer() : undefined;

  // --- バックエンドへ転送し、返ってきたものをそのままブラウザへ返す ----------
  try {
    return await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
    });
  } catch (error) {
    // Render が停止中・スリープ中などで届かなかった場合
    return new Response(
      JSON.stringify({
        detail:
          "サーバーに接続できませんでした。少し待ってから再度お試しください。",
      }),
      {
        status: 502, // 502 = Bad Gateway（転送先から応答が得られない）
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }
}
