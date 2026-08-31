// =============================================================================
// APIクライアントファイル (api.ts)
// =============================================================================
// このファイルでは、バックエンドのAPIと通信するための関数を定義します。
// axiosというライブラリを使ってHTTPリクエスト（データの送受信）を行います。
// =============================================================================

// axios: HTTPリクエストを簡単に行えるライブラリ
import axios from "axios";
import type { AnalysisResult, UserProfile } from "./types";

// APIのベースURL
// 開発時: vite.config.ts のプロキシ設定により http://localhost:8000 に転送される
// 本番時: Cloudflare Pages の functions/api/[[path]].js がバックエンドへ転送する
// どちらの環境でも同じ "/api" で動くため、この値は変更不要です。
const API_BASE_URL = "/api";

// =============================================================================
// 送信前の画像圧縮
// =============================================================================
// スマホの写真は 2〜5MB あることが多く、そのまま送ると
//   ・アップロードに時間がかかる
//   ・OpenAI に渡す画像が大きいほど料金と待ち時間が増える
// という問題があります。
//
// 一方で小さくしすぎると、成分表の極小フォントが潰れて読めなくなり、
// 解析精度が落ちます。そのため「長辺1600px・品質85%」という
// 文字が読める範囲で最も軽いあたりを狙って縮小します。
// これで多くの場合 300KB〜600KB 程度になります。
// =============================================================================

// 縮小後の長辺の最大ピクセル数
const MAX_EDGE = 1600;
// JPEGの品質（0〜1）。0.85 は見た目の劣化がほぼ分からない水準
const JPEG_QUALITY = 0.85;

/**
 * FileをdataURL（Base64文字列）として読み込む
 */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });
}

/**
 * dataURLから画像要素を作る（サイズを知るために一度読み込む必要がある）
 */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("画像の展開に失敗しました"));
    image.src = dataUrl;
  });
}

/**
 * 画像を縮小してJPEGのFileに変換する
 *
 * 何らかの理由で変換できなかった場合は、元のファイルをそのまま返します
 * （変換失敗でアップロード自体ができなくなるのを避けるため）。
 *
 * @param file - ユーザーが選択した元の画像ファイル
 * @returns 縮小後のJPEGファイル（失敗時は元のファイル）
 */
async function compressToJpeg(file: File): Promise<File> {
  try {
    const dataUrl = await readAsDataUrl(file);
    const img = await loadImage(dataUrl);

    // canvas: ブラウザ上でピクセル単位の描画ができるHTML要素。
    // ここに縮小して描き直すことでリサイズを行う。
    const canvas = document.createElement("canvas");

    // 長辺が MAX_EDGE を超える場合だけ縮小する（元が小さければ拡大しない）
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // toBlob: canvasの内容を指定した形式・品質のバイナリデータに変換する
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) return file;

    // 常に image/jpeg になるので、バックエンドの形式チェックも確実に通る
    return new File([blob], "upload.jpg", { type: "image/jpeg" });
  } catch {
    // 圧縮に失敗しても元のファイルで送信を試みる
    return file;
  }
}

/**
 * コスメ画像を解析するAPI呼び出し関数
 *
 * @param image - ユーザーが撮影した画像ファイル
 * @param profile - ユーザープロファイル（肌質、パーソナルカラーなど）
 * @returns 解析結果（相性スコア、成分リストなど）
 */
export async function analyzeCosmetic(
  image: File,
  profile: UserProfile
): Promise<AnalysisResult> {
  // 送信前に縮小する（通信量・料金・待ち時間の削減）
  const compressed = await compressToJpeg(image);

  // FormData: テキストとファイルを一緒に送るためのデータ形式
  // HTMLのformタグと同じように、複数のフィールドを持てます
  const formData = new FormData();

  // 画像ファイルをフォームデータに追加
  // "image" はバックエンドのエンドポイントで受け取るフィールド名と一致させる必要がある
  formData.append("image", compressed);

  // ユーザープロファイルの各フィールドをフォームデータに追加
  formData.append("skin_type", profile.skin_type);
  formData.append("personal_color", profile.personal_color);
  formData.append("desired_effects", profile.desired_effects);
  formData.append("avoid_ingredients", profile.avoid_ingredients);

  // axiosでPOSTリクエストを送信
  const response = await axios.post<AnalysisResult>(
    `${API_BASE_URL}/analyze`, // リクエスト先のURL
    formData, // 送信するデータ
    {
      headers: {
        // Content-Type: 送信するデータの形式を指定
        // FormDataを送るときは multipart/form-data を指定する
        "Content-Type": "multipart/form-data",
      },
      // Web検索経路だと1分近くかかることがあるため長めに待つ
      timeout: 120000,
    }
  );

  // response.data: axiosがAPIから受け取ったレスポンスのデータ部分
  return response.data;
}
