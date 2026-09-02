// =============================================================================
// 信頼度の表示 (ReliabilityNote.tsx)
// =============================================================================
// 「この結果はどこまで確からしいか」を伝えるための小さなカードです。
//
// 【なぜ作ったか】
// 解析は AI（LLM）が成分を読み取って分類しています。精度を上げる工夫はして
// いますが、それでも誤りは残ります。そこで、精度を上げる努力とは別に
// 「うまく読めなかったときは、そう言う」ことを設計に入れました。
//
// 具体的には次の3つを見せています。
//   ・成分表を読んだのか、商品名からWebで調べたのか（＝情報の出どころ）
//   ・成分表のうち何割を解析できたのか（＝取りこぼし）
//   ・成分表に見当たらず除外した成分があるか（＝AIの作り話を消した件数）
//
// 判定の中身はすべてバックエンド (verification.py) が計算しています。
// この画面は受け取った値を並べるだけで、独自の判断はしません。
// =============================================================================

import React from "react";
import type { Reliability } from "../types";

interface ReliabilityNoteProps {
  reliability?: Reliability; // 古い履歴には入っていないので任意
}

export const ReliabilityNote: React.FC<ReliabilityNoteProps> = ({
  reliability,
}) => {
  // この項目が無い（＝機能追加前に保存された履歴）なら何も出さない
  if (!reliability) return null;

  const { source, verified, source_count, listed_count, omission_rate, warnings } =
    reliability;

  // 注意文があれば黄色、なければ落ち着いたグレーで出す。
  // 「問題なし」を目立たせても情報量がないため、警告のときだけ色を付ける。
  const hasWarning = warnings.length > 0;
  const box = hasWarning
    ? "bg-amber-50 border border-amber-200"
    : "bg-gray-50 border border-gray-200";
  const heading = hasWarning ? "text-amber-700" : "text-gray-500";

  return (
    <div className={`rounded-2xl p-4 ${box}`}>
      <h2 className={`text-xs font-bold mb-2 ${heading}`}>
        {hasWarning ? "⚠️ 解析の精度について" : "🔎 解析の内訳"}
      </h2>

      {/* 出どころ */}
      <p className="text-xs text-gray-600 leading-relaxed">
        {source === "image"
          ? "パッケージの成分表を読み取って解析しました。"
          : "成分表が読み取れなかったため、商品名をもとにWebで調べた情報で解析しました。"}
      </p>

      {/* 数字の内訳（成分表を読んだときだけ意味がある） */}
      {verified && (
        <p className="text-xs text-gray-500 mt-1">
          成分表の {source_count} 件のうち {listed_count} 件を解析
          {omission_rate > 0 && `（読み取れなかった分 約${omission_rate}%）`}
        </p>
      )}

      {/* 注意文 */}
      {hasWarning && (
        <ul className="mt-2 space-y-1">
          {warnings.map((message, index) => (
            <li key={index} className="text-xs text-amber-800 leading-relaxed">
              ・{message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
