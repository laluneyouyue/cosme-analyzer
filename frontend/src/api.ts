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
// Viteのプロキシ設定（vite.config.ts）により、/api は http://localhost:8000 に転送される
const API_BASE_URL = "/api";

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
  // FormData: テキストとファイルを一緒に送るためのデータ形式
  // HTMLのformタグと同じように、複数のフィールドを持てます
  const formData = new FormData();

  // 画像ファイルをフォームデータに追加
  // "image" はバックエンドのエンドポイントで受け取るフィールド名と一致させる必要がある
  formData.append("image", image);

  // ユーザープロファイルの各フィールドをフォームデータに追加
  formData.append("skin_type", profile.skin_type);
  formData.append("personal_color", profile.personal_color);
  formData.append("desired_effects", profile.desired_effects);
  formData.append("avoid_ingredients", profile.avoid_ingredients);

  // axiosでPOSTリクエストを送信
  // try/catch: エラーが発生したときに対処するための構文
  const response = await axios.post<AnalysisResult>(
    `${API_BASE_URL}/analyze`, // リクエスト先のURL
    formData, // 送信するデータ
    {
      headers: {
        // Content-Type: 送信するデータの形式を指定
        // FormDataを送るときは multipart/form-data を指定する
        "Content-Type": "multipart/form-data",
      },
    }
  );

  // response.data: axiosがAPIから受け取ったレスポンスのデータ部分
  return response.data;
}
