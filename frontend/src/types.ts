// =============================================================================
// 型定義ファイル (types.ts)
// =============================================================================
// TypeScriptでは、データの「型」を事前に定義することで、
// コードの間違いをエラーとして早期に発見できます。
// このファイルでは、アプリ全体で使うデータの型を定義しています。
//
// 【バックエンドと必ずセットで変更する場所】
// ここの型は backend/schemas.py の Pydantic モデルと対になっています。
// どちらか片方だけ変えると、画面が期待するデータが来ない状態になります。
// =============================================================================

// =============================================================================
// 評価の5軸
// =============================================================================
// 軸のキーと日本語名は backend/config.py の AXES / AXIS_LABELS と一致させます。
// 「重視する効果」はこの日本語名そのままの文字列でAPIに送るため、
// 1文字でもずれると、選んだ効果がバックエンドに伝わりません。

export const AXES = [
  "moisturizing",
  "soothing",
  "anti_aging",
  "brightening",
  "pore",
] as const;

// typeof AXES[number]: 上の配列の中身（文字列5種）だけを許す型を作る書き方。
// これで存在しない軸名を書くとコンパイルエラーになります。
export type AxisKey = (typeof AXES)[number];

// プロフィールの選択肢と、結果画面の説明文で使う正式名称
export const AXIS_LABELS: Record<AxisKey, string> = {
  moisturizing: "保湿・うるおい",
  soothing: "鎮静・肌あれケア",
  anti_aging: "ハリ・エイジングケア",
  brightening: "透明感・くすみケア",
  pore: "毛穴・皮脂ケア",
};

// レーダーチャートの軸ラベル用の短い名前。
// グラフの外周は場所が狭く、正式名称だと文字が重なって読めなくなるため。
export const AXIS_SHORT_LABELS: Record<AxisKey, string> = {
  moisturizing: "保湿",
  soothing: "鎮静",
  anti_aging: "ハリ",
  brightening: "透明感",
  pore: "毛穴",
};

// Record<AxisKey, number>: 5軸すべてをキーに持ち、値が数値のオブジェクト。
// レーダーの外側（製品の実力）と内側（あなたが求めるもの）の両方で使います。
export type AxisScores = Record<AxisKey, number>;

// =============================================================================
// ユーザープロファイル
// =============================================================================

// interface: オブジェクト（データの塊）の形を定義するTypeScriptの機能
export interface UserProfile {
  skin_type: string; // 肌質
  age_group: string; // 年代
  // パーソナルカラーは成分表から判定できないため、解析には送っていません。
  // 画面には残していますが、現時点では表示だけの項目です。
  personal_color: string;
  desired_effects: string[]; // 重視する効果（AXIS_LABELS の値。複数選択）
  avoid_ingredients: string; // 避けたい成分（カンマ区切りの自由入力）
}

// =============================================================================
// 解析結果
// =============================================================================

// 個別の成分解析結果の型
export interface IngredientAnalysis {
  name: string; // 日本語の成分名
  original_name: string; // 元の成分名（外国語の場合）
  description: string; // 解説
  rating: "good" | "bad" | "neutral"; // 評価（Pythonが決める）
  position: number; // 成分表の何番目か（1始まり）
  is_top_ranked: boolean; // 配合上位かどうか
  is_avoided: boolean; // 「避けたい成分」に該当したか
  irritation_risk: number; // 刺激リスク (0-3)
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
  product_name: string; // 製品名（読み取れなければ「名称不明」）
  product_summary: string; // どういう製品かの説明
  compatibility_score: number; // 相性スコア (0-100)
  score_reason: string; // なぜその点数なのかの説明
  radar_product: AxisScores; // レーダー: この製品の実力
  // 点数の計算に使った軸。相性スコアはこの軸の平均そのものなので、
  // 画面ではここを強調して「なぜこの点数か」を見えるようにする。
  focus_axes: string[];
  // 年代からの提案。点数には一切影響しない、情報としての提示。
  age_hint_axes: string[];
  axis_contributors: Record<string, string[]>; // 軸ごとに効いている成分名
  irritation_level: "低" | "中" | "高";
  irritation_reasons: string[]; // 刺激リスクの根拠になった成分名
  ingredients: IngredientAnalysis[]; // 成分リスト
  source: "image" | "web";
  // ? を付けて「無いかもしれない」型にしている。
  // この項目を追加する前に保存された履歴には入っていないため。
  reliability?: Reliability;
}

// =============================================================================
// 履歴
// =============================================================================

// 解析履歴1件分のデータ型
export interface HistoryItem {
  id: string; // 一意のID（保存時のタイムスタンプ文字列）
  date: string; // 解析日時（ISO形式の文字列）
  imageUrl: string; // 画像のdata URL（ページ更新後も表示できるBase64形式）
  result: AnalysisResult; // 解析結果
  // 【なぜプロフィールも一緒に保存するのか】
  // 相性スコアは「そのときのプロフィール」との相性です。
  // あとから肌質や重視する効果を変えると、過去の点数が何を意味するのか
  // 分からなくなってしまうため、解析時の条件を写し取って一緒に残します。
  profile?: UserProfile;
}

// =============================================================================
// 画面の状態
// =============================================================================

// アプリ全体の画面（ページ）の状態を表す型
// Union型: 複数の型のうちどれかひとつ、という意味
export type AppPage = "home" | "profile" | "result" | "history";
