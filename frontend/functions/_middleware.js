// =============================================================================
// 合言葉によるアクセス制限（Basic認証）
// =============================================================================
// このファイルは Cloudflare Pages の「ミドルウェア」です。
// ミドルウェア = すべてのリクエストが本来の処理に届く前に必ず通る場所。
// ここで門番をすることで、画面もAPIもまとめて保護できます。
//
// 【Basic認証とは】
//   ブラウザ標準のログイン窓（ID/パスワードを聞くダイアログ）を出す仕組み。
//   アプリ側にログイン画面を作らなくてよいのが利点です。
//   相手のメールアドレスなどを聞く必要がないので、
//   「URLとID・パスワードを伝えるだけ」で共有できます。
//
// 【設定方法】
//   Cloudflare Pages の Settings → Environment variables で
//     BASIC_AUTH_USER = guest
//     BASIC_AUTH_PASS = 好きなパスワード（半角英数字にしてください）
//   を登録します。未設定の場合は認証をかけません（＝誰でも見られる）。
// =============================================================================

export async function onRequest(context) {
  // next(): 門番を通過して、本来の処理（画面の配信やAPI転送）へ進む関数
  const { request, env, next } = context;

  const expectedUser = env.BASIC_AUTH_USER;
  const expectedPass = env.BASIC_AUTH_PASS;

  // 環境変数が未設定なら認証なしで通す。
  // （設定前に自分まで締め出されて何も確認できなくなるのを防ぐため）
  if (!expectedUser || !expectedPass) {
    return next();
  }

  // Authorization ヘッダーは "Basic <Base64でエンコードしたID:パスワード>" の形
  const authHeader = request.headers.get("Authorization") || "";

  if (authHeader.startsWith("Basic ")) {
    try {
      // atob: Base64文字列を元に戻す関数
      const decoded = atob(authHeader.slice(6));

      // パスワードに ":" が含まれても壊れないよう、最初の ":" だけで分割する
      const separator = decoded.indexOf(":");
      const inputUser = decoded.slice(0, separator);
      const inputPass = decoded.slice(separator + 1);

      if (inputUser === expectedUser && inputPass === expectedPass) {
        // 認証成功 → 本来の処理へ進む
        return next();
      }
    } catch {
      // Base64が壊れていた場合などは、下の「認証が必要」レスポンスに落ちる
    }
  }

  // --- 認証失敗・未入力の場合 ---------------------------------------------
  // 401 と WWW-Authenticate ヘッダーを返すと、
  // ブラウザが自動的にID/パスワードの入力ダイアログを表示します。
  return new Response("認証が必要です", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="cosme-analyzer", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
