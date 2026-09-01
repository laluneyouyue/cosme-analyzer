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
//     BASIC_AUTH_PASS = 長いランダム文字列
//   を Production と Preview の両方に登録します。
//
// 【重要な設計方針: フェイルクローズ】
//   環境変数が未設定のときは「誰でも通す」ではなく「全員拒否」にしています。
//   設定漏れがそのまま全世界への公開になってしまうのを防ぐためです。
//   （安全側に倒す、という意味で fail-closed と呼びます）
// =============================================================================

/**
 * 2つのバイト列を「途中で打ち切らずに」比較する
 *
 * 【なぜ === を使わないのか】
 * 通常の文字列比較は、1文字目が違えばそこで終了します。
 * すると「合っている文字数が多いほど、応答が返るまでの時間がわずかに長い」
 * という差が生まれ、それを何万回も測ることでパスワードを1文字ずつ
 * 割り出せてしまいます（タイミング攻撃）。
 *
 * この関数は必ず最後まで全バイトを比較するため、
 * 一致・不一致で処理時間が変わりません。
 */
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;

  // XOR: 同じ値なら0、違えば0以外になる演算。
  // それを OR で累積するので、1バイトでも違えば diff は0以外になる。
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * 文字列をSHA-256でハッシュ化して固定長（32バイト）のバイト列にする
 *
 * ハッシュ化してから比較することで、
 * 「入力した文字数」すら相手に知られないようにしています。
 */
async function digest(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(hash);
}

/**
 * 2つの文字列を、長さも内容も漏らさずに比較する
 */
async function safeCompare(a, b) {
  const [hashA, hashB] = await Promise.all([digest(a), digest(b)]);
  return constantTimeEqual(hashA, hashB);
}

/**
 * 認証を要求するレスポンス
 *
 * 401 と WWW-Authenticate ヘッダーを返すと、
 * ブラウザが自動的にID/パスワードの入力ダイアログを表示します。
 *
 * 本文には理由を書きません。「ユーザー名は合っているがパスワードが違う」
 * といった情報を与えないためです（総当たりの手がかりを減らす）。
 */
function requireAuth() {
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Restricted", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
      // 認証前のページを中継サーバー等にキャッシュさせない
      "Cache-Control": "no-store",
    },
  });
}

export async function onRequest(context) {
  // next(): 門番を通過して、本来の処理（画面の配信やAPI転送）へ進む関数
  const { request, env, next } = context;

  const expectedUser = env.BASIC_AUTH_USER;
  const expectedPass = env.BASIC_AUTH_PASS;

  // --- 設定が無ければ全員拒否する（フェイルクローズ）-----------------------
  // 以前は「未設定なら通す」にしていましたが、それだと
  // 環境変数を登録していないプレビュー環境が誰でも見られる状態になります。
  // 設定漏れは「壊れる」で気づける方が、「公開されている」より安全です。
  if (!expectedUser || !expectedPass) {
    return new Response(
      "このサイトは設定が未完了のため利用できません。",
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Authorization ヘッダーは "Basic <Base64でエンコードしたID:パスワード>" の形
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Basic ")) {
    return requireAuth();
  }

  let inputUser;
  let inputPass;
  try {
    // atob: Base64文字列を元に戻す関数
    const decoded = atob(authHeader.slice(6));

    // パスワードに ":" が含まれても壊れないよう、最初の ":" だけで分割する
    const separator = decoded.indexOf(":");
    if (separator < 0) return requireAuth();

    inputUser = decoded.slice(0, separator);
    inputPass = decoded.slice(separator + 1);
  } catch {
    // Base64が壊れていた場合
    return requireAuth();
  }

  // ユーザー名とパスワードを両方とも検証する。
  // && で短絡させず両方を必ず評価することで、
  // 「ユーザー名だけ合っていた場合」も処理時間が変わらないようにする。
  const userOk = await safeCompare(inputUser, expectedUser);
  const passOk = await safeCompare(inputPass, expectedPass);

  if (userOk && passOk) {
    // 認証成功 → 本来の処理へ進む
    return next();
  }

  return requireAuth();
}
