// =============================================================================
// 解析結果画面 (ResultPage.tsx)
// =============================================================================
// バックエンドから受け取った解析結果を表示する画面です。
//
// 【この画面の並び順の考え方】
//   1. 何の製品か        … 製品名。何を見ているのか分からないと点数も読めない
//   2. 相性スコアと理由  … 数字だけでなく「なぜ」を必ず添える
//   3. 2重レーダー       … 点数の内訳。スコアの計算根拠そのもの
//   4. 刺激リスク        … 効果とは別の軸なので独立して出す
//   5. 解析の信頼度      … どこまで確からしいか
//   6. 成分リスト        … 詳細
//   7. 解析時のプロフィール・免責
//
// 【2重レーダーについて】
// 外側（ピンク）がこの製品の実力、内側（紫）があなたが求めるものです。
// 相性スコアは「重なった面積 ÷ 求めた面積」で計算しているため、
// グラフの見た目と点数が必ず一致します。
// 「なんとなく高い/低い」ではなく、どの軸が足りないのかが目で分かります。
// =============================================================================

import React from "react";
// Recharts: Reactで使えるグラフ描画ライブラリ
// 必要なコンポーネントだけを選んでimportする（ツリーシェイキング）
import {
  RadarChart, // レーダーチャートのコンテナ
  PolarGrid, // レーダーチャートの背景グリッド
  PolarAngleAxis, // 各軸のラベル
  PolarRadiusAxis, // 中心から外周への目盛り
  Radar, // 実際のレーダー（塗りつぶしエリア）
  ResponsiveContainer, // 親要素のサイズに応じて自動リサイズ
  Legend, // 凡例
  Tooltip, // マウスオーバー時のツールチップ
} from "recharts";
import type { AnalysisResult, IngredientAnalysis, UserProfile } from "../types";
import { AXES, AXIS_LABELS, AXIS_SHORT_LABELS } from "../types";
import { ReliabilityNote } from "./ReliabilityNote";

interface ResultPageProps {
  result: AnalysisResult; // 解析結果データ
  imageUrl: string; // 解析した画像のURL（プレビュー用）
  profile?: UserProfile; // 解析したときのプロフィール（履歴から開いた場合も当時の値）
  onBack: () => void; // ホームに戻る関数
}

// 成分評価バッジのスタイルを返すヘルパー関数
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
  if (score >= 60) return { color: "text-blue-500", message: "相性はいい感じ" };
  if (score >= 40) return { color: "text-yellow-500", message: "相性はまずまず" };
  return { color: "text-red-500", message: "ちょっと注意が必要かも" };
};

// 刺激リスクの見た目
const getIrritationStyle = (level: AnalysisResult["irritation_level"]) => {
  switch (level) {
    case "高":
      return { box: "bg-red-50 border-red-200", text: "text-red-600" };
    case "中":
      return { box: "bg-amber-50 border-amber-200", text: "text-amber-700" };
    default:
      return { box: "bg-emerald-50 border-emerald-200", text: "text-emerald-600" };
  }
};

export const ResultPage: React.FC<ResultPageProps> = ({
  result,
  imageUrl,
  profile,
  onBack,
}) => {
  const scoreStyle = getScoreColor(result.compatibility_score);
  const irritationStyle = getIrritationStyle(result.irritation_level);

  // レーダーチャート用のデータを変換
  // Recharts は [{ subject: "ラベル", 系列名: 数値, ... }] の配列形式を期待している。
  // 1つのオブジェクトに product と need の両方を入れることで2本重ねて描ける。
  const radarData = AXES.map((axis) => ({
    subject: AXIS_SHORT_LABELS[axis],
    product: result.radar_product[axis],
    need: result.radar_need[axis],
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
        {/* 製品カード（何を解析したのか） */}
        <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <img
            src={imageUrl}
            alt="解析した画像"
            className="w-16 h-16 object-cover rounded-xl flex-shrink-0"
          />
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-800 leading-snug break-words">
              {result.product_name}
            </h2>
            {result.product_summary && (
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                {result.product_summary}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              {result.ingredients.length} 種類の成分を解析
            </p>
          </div>
        </div>

        {/* 総合相性スコアカード（最も目立つ要素） */}
        <div className="bg-white rounded-3xl p-6 shadow-md text-center">
          <p className="text-sm text-gray-500 mb-2">あなたとのトータル相性</p>
          {/* 相性スコアを大きく表示 */}
          <div className={`text-7xl font-black ${scoreStyle.color} leading-none`}>
            {result.compatibility_score}
            <span className="text-4xl">%</span>
          </div>
          <p className={`text-lg font-semibold mt-2 ${scoreStyle.color}`}>
            {scoreStyle.message}
          </p>
          {/* なぜその点数なのかの説明（バックエンドが計算値から組み立てた文） */}
          {result.score_reason && (
            <div className="mt-4 bg-gray-50 rounded-2xl p-3">
              <p className="text-sm text-gray-600 leading-relaxed">
                {result.score_reason}
              </p>
            </div>
          )}
        </div>

        {/* 2重レーダーチャート */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-700 mb-1">
            📊 求めるもの と 製品の実力
          </h2>
          <p className="text-xs text-gray-400 mb-2">
            紫の内側があなたの希望、ピンクがこの製品。
            重なっている面積がそのまま相性スコアです
          </p>
          {/* ResponsiveContainer: 親要素の横幅に合わせて自動サイズ調整 */}
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData}>
              {/* 背景グリッド（多角形の格子） */}
              <PolarGrid stroke="#e9d5ff" />
              {/* 各軸のラベル */}
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fill: "#6b7280", fontSize: 12 }}
              />
              {/* domain を 0〜100 で固定するのが重要。
                  指定しないとデータの最大値に合わせて自動で伸縮するため、
                  2本のレーダーの目盛りがずれて「重なり」が嘘になる。 */}
              <PolarRadiusAxis
                domain={[0, 100]}
                tick={false}
                axisLine={false}
              />
              {/* 内側: あなたが求めるもの。先に描いて背面に置く */}
              <Radar
                name="あなたが求めるもの"
                dataKey="need"
                stroke="#a78bfa"
                fill="#a78bfa"
                fillOpacity={0.25}
              />
              {/* 外側: この製品の実力 */}
              <Radar
                name="この製品の実力"
                dataKey="product"
                stroke="#ec4899"
                fill="#ec4899"
                fillOpacity={0.35}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                iconType="circle"
              />
              <Tooltip formatter={(value) => [`${value}点`, ""]} />
            </RadarChart>
          </ResponsiveContainer>

          {/* 軸ごとの内訳。グラフだけでは「何がその点数を作ったか」が分からない */}
          <div className="mt-2 space-y-2">
            {AXES.map((axis) => {
              const contributors = result.axis_contributors[axis] ?? [];
              return (
                <div key={axis} className="text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-gray-600 font-medium">
                      {AXIS_LABELS[axis]}
                    </span>
                    <span className="text-gray-400 whitespace-nowrap">
                      製品 {result.radar_product[axis]} / 希望{" "}
                      {result.radar_need[axis]}
                    </span>
                  </div>
                  {/* 横棒でも表す。数字だけより差が掴みやすい */}
                  <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full bg-pink-400 rounded-full"
                      style={{ width: `${result.radar_product[axis]}%` }}
                    />
                  </div>
                  {contributors.length > 0 && (
                    <p className="text-[11px] text-gray-400 mt-1">
                      主に {contributors.join("・")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 刺激リスク（効果とは性質が違うのでレーダーには載せない） */}
        <div className={`rounded-2xl p-4 border ${irritationStyle.box}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-700">🌡 刺激リスク</h2>
            <span className={`text-lg font-black ${irritationStyle.text}`}>
              {result.irritation_level}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            {result.irritation_reasons.length > 0
              ? `${result.irritation_reasons.join("・")} などが刺激になる場合があります`
              : "刺激になりやすい成分は目立ちませんでした"}
          </p>
        </div>

        {/* 解析の信頼度（読み取れなかった分があれば注意を出す） */}
        <ReliabilityNote reliability={result.reliability} />

        {/* 成分リスト */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-700 mb-1">🧪 成分別解析</h2>
          <p className="text-xs text-gray-400 mb-3">
            成分表は配合量の多い順に並ぶ決まりのため、上位の成分ほど
            評価に強く反映しています
          </p>

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
                <div key={index} className={`rounded-xl p-3 ${style.container}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* 成分名（日本語） */}
                        <p className="text-sm font-semibold text-gray-800">
                          {ingredient.name}
                        </p>
                        {/* 配合上位バッジ */}
                        {ingredient.is_top_ranked && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-pink-100 text-pink-600 border border-pink-200 whitespace-nowrap">
                            配合上位
                          </span>
                        )}
                        {/* 避けたい成分バッジ */}
                        {ingredient.is_avoided && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200 whitespace-nowrap">
                            避けたい成分
                          </span>
                        )}
                      </div>
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

        {/* 解析時のプロフィール
            この点数が「誰にとっての点数か」を残しておく。
            履歴から開いたときも当時の条件が表示される。 */}
        {profile && (
          <div className="bg-white/70 rounded-2xl p-4 shadow-sm">
            <h2 className="text-xs font-bold text-gray-500 mb-2">
              この解析に使った条件
            </h2>
            <dl className="text-xs text-gray-500 space-y-1">
              <div className="flex gap-2">
                <dt className="w-20 flex-shrink-0 text-gray-400">肌質</dt>
                <dd>{profile.skin_type}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 flex-shrink-0 text-gray-400">年代</dt>
                <dd>{profile.age_group}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 flex-shrink-0 text-gray-400">重視する効果</dt>
                <dd>
                  {profile.desired_effects.length > 0
                    ? profile.desired_effects.join("、")
                    : "未設定"}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 flex-shrink-0 text-gray-400">避けたい成分</dt>
                <dd>{profile.avoid_ingredients || "なし"}</dd>
              </div>
            </dl>
          </div>
        )}

        {/* 免責。医薬品的な効能を保証するものではないことを明示する */}
        <p className="text-[11px] text-gray-400 leading-relaxed px-1">
          この結果はAIによる成分表の読み取りと分類に基づく参考情報です。
          効果・効能を保証するものではなく、実際の使用感には個人差があります。
          肌トラブルや治療中の症状については、必ず医師・薬剤師にご相談ください。
        </p>

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
