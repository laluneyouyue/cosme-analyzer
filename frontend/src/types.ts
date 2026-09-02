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

// 解析結果の「確からしさ」の型
// バックエンドが成分表の原文と解析結果を突き合わせて算出する値です。
// 点数だけを見せると、しっかり読めた写真の結果なのか、
// 半分しか読めなかった写真の結果なのかが区別できないため、
// 一緒に受け取って画面にも出しています。
export interface Reliability {
  source: "image" | "web"; // image=成分表を読んだ / web=商品名から検索した
  verified: boolean; // 成分表の原文と突き合わせたか（web検索時は false）
  source_count: number; // 成分表から数えた成分の件数
  listed_count: number; // 解析結果に載った成分の件数
  dropped_count: number; // 成分表に見当たらず除外した件数
  omission_rate: number; // 取りこぼし率（0-100の%）
  warnings: string[]; // 画面に出す注意文（問題なければ空配列）
}

// バックエンドAPIから返ってくる解析結果全体の型
export interface AnalysisResult {
  compatibility_score: number; // 相性スコア (0-100)
  radar_chart: RadarChartData; // レーダーチャート用データ
  ingredients: IngredientAnalysis[]; // 成分リスト（配列）
  summary: string; // 総合コメント
  // ? を付けて「無いかもしれない」型にしている。
  // この項目を追加する前に保存された履歴には入っていないため。
  reliability?: Reliability;
}

// 解析履歴1件分のデータ型
export interface HistoryItem {
  id: string;              // 一意のID（保存時のタイムスタンプ文字列）
  date: string;            // 解析日時（ISO形式の文字列）
  imageUrl: string;        // 画像のdata URL（ページ更新後も表示できるBase64形式）
  result: AnalysisResult;  // 解析結果
}

// アプリ全体の画面（ページ）の状態を表す型
// Union型: 複数の型のうちどれかひとつ、という意味
export type AppPage = "home" | "profile" | "result" | "history";
