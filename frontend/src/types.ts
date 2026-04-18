// =============================================================================
// 型定義ファイル (types.ts)
// =============================================================================
// TypeScriptでは、データの「型」を事前に定義することで、
// コードの間違いをエラーとして早期に発見できます。
// このファイルでは、アプリ全体で使うデータの型を定義しています。
// =============================================================================

// ユーザープロファイルの型
// interface: オブジェクト（データの塊）の形を定義するTypeScriptの機能
export interface UserProfile {
  skin_type: string; // 肌質
  personal_color: string; // パーソナルカラー
  desired_effects: string; // 重視する効果
  avoid_ingredients: string; // 避けたい成分
}

// 個別の成分解析結果の型
export interface IngredientAnalysis {
  name: string; // 日本語の成分名
  original_name: string; // 元の成分名（外国語の場合）
  rating: "good" | "bad" | "neutral"; // 評価（good/bad/neutral のいずれか）
  description: string; // 解説
}

// レーダーチャート用のスコアデータの型
export interface RadarChartData {
  moisturizing: number; // 保湿力
  soothing: number; // 鎮静力
  anti_aging: number; // エイジングケア
  brightening: number; // 透明感・美白
  safety: number; // 安全性
}

// バックエンドAPIから返ってくる解析結果全体の型
export interface AnalysisResult {
  compatibility_score: number; // 相性スコア (0-100)
  radar_chart: RadarChartData; // レーダーチャート用データ
  ingredients: IngredientAnalysis[]; // 成分リスト（配列）
  summary: string; // 総合コメント
}

// アプリ全体の画面（ページ）の状態を表す型
// Union型: 複数の型のうちどれかひとつ、という意味
export type AppPage = "home" | "profile" | "result";
