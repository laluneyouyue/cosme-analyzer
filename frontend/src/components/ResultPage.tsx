// =============================================================================
// 解析結果画面 (ResultPage.tsx)
// =============================================================================
// バックエンドAPIから受け取った解析結果を表示する画面です。
// - 相性スコア（大きなパーセンテージ表示）
// - レーダーチャート（成分の傾向を視覚化）
// - 成分リスト（良い成分は緑、悪い成分は赤でハイライト）
// =============================================================================

import React from "react";
// Recharts: Reactで使えるグラフ描画ライブラリ
// 必要なコンポーネントだけを選んでimportする（ツリーシェイキング）
import {
  RadarChart,        // レーダーチャートのコンテナ
  PolarGrid,         // レーダーチャートの背景グリッド
  PolarAngleAxis,    // 各軸のラベル
  Radar,             // 実際のレーダー（塗りつぶしエリア）
  ResponsiveContainer, // 親要素のサイズに応じて自動リサイズ
  Tooltip,           // マウスオーバー時のツールチップ
} from "recharts";
import type { AnalysisResult, IngredientAnalysis } from "../types";

interface ResultPageProps {
  result: AnalysisResult; // 解析結果データ
  imageUrl: string; // 解析した画像のURL（プレビュー用）
  onBack: () => void; // ホームに戻る関数
}

// レーダーチャートの各軸のラベルを定義
// dataKey: データのキー名（RadarChartDataのプロパティ名と一致させる）
const RADAR_LABELS = {
  moisturizing: "保湿",
  soothing: "鎮静",
  anti_aging: "エイジング\nケア",
  brightening: "透明感",
  safety: "安全性",
};

// 成分評価バッジのスタイルを返すヘルパー関数
// 評価（good/bad/neutral）に応じて異なる色を返す
const getRatingStyle = (rating: IngredientAnalysis["rating"]) => {
  switch (rating) {
    case "good":
      return {
        badge: "bg-emerald-100 text-emerald-700 border border-emerald-200",
        container: "bg-emerald-50 border-l-4 border-l-emerald-400",
        label: "◎ 相性◎",
      };
    case "bad":
      return {
        badge: "bg-red-100 text-red-700 border border-red-200",
        container: "bg-red-50 border-l-4 border-l-red-400",
        label: "× 注意",
      };
    default:
      return {
        badge: "bg-gray-100 text-gray-600 border border-gray-200",
        container: "bg-gray-50 border-l-4 border-l-gray-300",
        label: "△ 普通",
      };
  }
};

// スコアに応じた色とメッセージを返すヘルパー関数
const getScoreColor = (score: number) => {
  if (score >= 80) return { color: "text-emerald-500", message: "とっても相性◎" };
  if (score >= 60) return { color: "text-blue-500", message: "比較的相性良好" };
  if (score >= 40) return { color: "text-yellow-500", message: "普通の相性" };
  return { color: "text-red-500", message: "注意が必要" };
};

export const ResultPage: React.FC<ResultPageProps> = ({
  result,
  imageUrl,
  onBack,
}) => {
  const scoreStyle = getScoreColor(result.compatibility_score);

  // レーダーチャート用のデータを変換
  // Rechartsは [{ subject: "ラベル", value: 数値 }] の配列形式を期待している
  const radarData = Object.entries(result.radar_chart).map(([key, value]) => ({
    subject: RADAR_LABELS[key as keyof typeof RADAR_LABELS] || key,
    value: value,
    fullMark: 100, // 最大値
  }));

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-purple-50">
      {/* ヘッダー */}
      <div className="bg-white shadow-sm px-4 py-3 flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-pink-400 hover:text-pink-600 transition-colors"
          aria-label="ホームに戻る"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-gray-800">解析結果</h1>
      </div>

      {/* メインコンテンツ */}
      <div className="max-w-md mx-auto px-4 py-6 space-y-5">

        {/* 総合相性スコアカード（最も目立つ要素） */}
        <div className="bg-white rounded-3xl p-6 shadow-md text-center">
          <p className="text-sm text-gray-500 mb-2">あなたとのトータル相性</p>
          {/* 相性スコアを大きく表示 */}
          <div
            className={`text-7xl font-black ${scoreStyle.color} leading-none`}
          >
            {result.compatibility_score}
            <span className="text-4xl">%</span>
          </div>
          <p className={`text-lg font-semibold mt-2 ${scoreStyle.color}`}>
            {scoreStyle.message}
          </p>
          {/* 総合コメント */}
          <div className="mt-4 bg-gray-50 rounded-2xl p-3">
            <p className="text-sm text-gray-600 leading-relaxed">
              {result.summary}
            </p>
          </div>
        </div>

        {/* 解析した画像のサムネイル */}
        <div className="bg-white rounded-2xl p-3 shadow-sm flex items-center gap-3">
          <img
            src={imageUrl}
            alt="解析した画像"
            className="w-16 h-16 object-cover rounded-xl"
          />
          <div>
            <p className="text-xs font-semibold text-gray-700">解析した画像</p>
            <p className="text-xs text-gray-400">
              {result.ingredients.length} 種類の成分を検出
            </p>
          </div>
        </div>

        {/* レーダーチャートカード */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-700 mb-3">
            📊 成分の特性レーダー
          </h2>
          {/* ResponsiveContainer: 親要素の横幅に合わせて自動サイズ調整 */}
          <ResponsiveContainer width="100%" height={250}>
            <RadarChart data={radarData}>
              {/* 背景グリッド（多角形の格子） */}
              <PolarGrid stroke="#f0abfc" strokeOpacity={0.5} />
              {/* 各軸のラベル */}
              <PolarAngleAxis
                dataKey="subject"
                tick={{
                  fill: "#6b7280",
                  fontSize: 11,
                  fontFamily: "sans-serif",
                }}
              />
              {/* レーダー本体（塗りつぶしエリア） */}
              <Radar
                name="成分スコア"
                dataKey="value"
                stroke="#ec4899" // 外枠の色
                fill="#ec4899" // 塗りつぶしの色
                fillOpacity={0.3} // 塗りつぶしの透明度
              />
              {/* マウスオーバー時に表示されるツールチップ */}
              <Tooltip
                formatter={(value) => [`${value}点`, "スコア"]}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* 成分リスト */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-700 mb-3">
            🧪 成分別解析
          </h2>

          {/* 凡例（レジェンド） */}
          <div className="flex gap-3 mb-4 text-xs">
            <span className="flex items-center gap-1 text-emerald-600">
              <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" />
              相性◎
            </span>
            <span className="flex items-center gap-1 text-red-500">
              <span className="w-3 h-3 rounded-full bg-red-400 inline-block" />
              注意
            </span>
            <span className="flex items-center gap-1 text-gray-500">
              <span className="w-3 h-3 rounded-full bg-gray-300 inline-block" />
              普通
            </span>
          </div>

          {/* 成分リスト（スクロール可能エリア） */}
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {result.ingredients.map((ingredient, index) => {
              const style = getRatingStyle(ingredient.rating);
              return (
                /* 各成分のカード */
                <div
                  key={index}
                  className={`rounded-xl p-3 ${style.container}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {/* 成分名（日本語） */}
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {ingredient.name}
                      </p>
                      {/* 元の成分名（外国語の場合） */}
                      {ingredient.original_name &&
                        ingredient.original_name !== ingredient.name && (
                          <p className="text-xs text-gray-400 truncate">
                            {ingredient.original_name}
                          </p>
                        )}
                      {/* 成分の解説 */}
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                        {ingredient.description}
                      </p>
                    </div>
                    {/* 評価バッジ */}
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${style.badge}`}
                    >
                      {style.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 別のコスメを解析するボタン */}
        <button
          onClick={onBack}
          className="w-full bg-gradient-to-r from-pink-400 to-purple-400 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:shadow-xl active:scale-95 transition-all"
        >
          📷 別のコスメを解析する
        </button>
      </div>
    </div>
  );
};
