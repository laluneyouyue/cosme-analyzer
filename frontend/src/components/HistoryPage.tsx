// =============================================================================
// 解析履歴画面 (HistoryPage.tsx)
// =============================================================================
// 過去の解析履歴をリスト表示します。
// 通常モード: カードタップで結果詳細を表示
// 選択モード: チェックボックスで複数選択 → 選択削除 / すべて選択 が使える
// =============================================================================

import React, { useState } from "react";
import type { HistoryItem, AnalysisResult } from "../types";

interface HistoryPageProps {
  history: HistoryItem[];
  onBack: () => void;
  onSelectItem: (result: AnalysisResult, imageUrl: string) => void;
  onDeleteItems: (ids: string[]) => void; // 指定IDの履歴を削除する関数
}

// スコアに応じた色を返すヘルパー
const getScoreColor = (score: number) => {
  if (score >= 80) return "text-emerald-500";
  if (score >= 60) return "text-blue-500";
  if (score >= 40) return "text-yellow-500";
  return "text-red-500";
};

const formatDate = (isoString: string) =>
  new Date(isoString).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export const HistoryPage: React.FC<HistoryPageProps> = ({
  history,
  onBack,
  onSelectItem,
  onDeleteItems,
}) => {
  // 選択モードのON/OFF
  const [isSelectMode, setIsSelectMode] = useState(false);

  // 選択中のアイテムIDを管理する Set（重複なしの集合）
  // Set: 同じ値を持てない配列のような構造。追加・削除・存在確認が高速
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 表示用: 新しい順に並べた配列（元の配列は変更しない）
  const displayHistory = [...history].reverse();

  // すべて選択されているか判定
  const isAllSelected = displayHistory.length > 0 && selectedIds.size === displayHistory.length;

  // ==========================================================================
  // ハンドラ関数
  // ==========================================================================

  // 選択モードを終了してチェックをリセット
  const exitSelectMode = () => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
  };

  // 1件のチェックを切り替える
  const toggleSelect = (id: string) => {
    // Set は immutable に扱うため、毎回新しい Set を作る
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id); // 選択済み → 解除
      } else {
        next.add(id);    // 未選択  → 選択
      }
      return next;
    });
  };

  // すべて選択 / すべて解除 を切り替える
  const toggleSelectAll = () => {
    if (isAllSelected) {
      // 全選択済み → 全解除
      setSelectedIds(new Set());
    } else {
      // 一部または未選択 → 全選択
      setSelectedIds(new Set(displayHistory.map((item) => item.id)));
    }
  };

  // 選択中のアイテムを削除する
  const handleDeleteSelected = () => {
    const ids = Array.from(selectedIds);
    onDeleteItems(ids);
    exitSelectMode();
  };

  // ==========================================================================
  // レンダリング
  // ==========================================================================

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-purple-50">

      {/* ヘッダー */}
      <div className="bg-white shadow-sm px-4 py-3">
        {isSelectMode ? (
          /* 選択モード時のヘッダー */
          <div className="flex items-center justify-between">
            {/* キャンセルボタン */}
            <button
              onClick={exitSelectMode}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors px-1"
            >
              キャンセル
            </button>

            {/* 選択件数 */}
            <span className="text-sm font-semibold text-gray-700">
              {selectedIds.size}件を選択中
            </span>

            {/* すべて選択 / 解除 */}
            <button
              onClick={toggleSelectAll}
              className="text-sm text-pink-500 hover:text-pink-700 transition-colors font-medium px-1"
            >
              {isAllSelected ? "すべて解除" : "すべて選択"}
            </button>
          </div>
        ) : (
          /* 通常モード時のヘッダー */
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="text-pink-400 hover:text-pink-600 transition-colors"
                aria-label="ホームに戻る"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-lg font-semibold text-gray-800">解析履歴</h1>
            </div>
            {/* 履歴が1件以上あるときだけ「選択」ボタンを表示 */}
            {history.length > 0 && (
              <button
                onClick={() => setIsSelectMode(true)}
                className="text-sm text-pink-400 hover:text-pink-600 transition-colors font-medium px-1"
              >
                選択
              </button>
            )}
          </div>
        )}
      </div>

      {/* メインコンテンツ */}
      <div className="max-w-md mx-auto px-4 py-6">
        {history.length === 0 ? (
          /* 履歴が空のときの表示 */
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm">まだ履歴がありません</p>
            <p className="text-xs">コスメを解析すると、ここに履歴が表示されます</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-400 text-right">{history.length}件の履歴</p>

            {displayHistory.map((item) => {
              const isSelected = selectedIds.has(item.id);

              return (
                <div
                  key={item.id}
                  // 選択モードかどうかでタップ時の動作を切り替える
                  onClick={() =>
                    isSelectMode
                      ? toggleSelect(item.id)         // 選択モード: チェックを切り替え
                      : onSelectItem(item.result, item.imageUrl) // 通常: 結果画面へ
                  }
                  className={`w-full bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4 transition-all cursor-pointer
                    ${isSelectMode && isSelected
                      ? "ring-2 ring-pink-400 bg-pink-50"  // 選択中のスタイル
                      : "hover:shadow-md active:scale-95"  // 通常のスタイル
                    }`}
                >
                  {/* 選択モード時はチェックボックス表示 */}
                  {isSelectMode && (
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors
                      ${isSelected ? "bg-pink-400 border-pink-400" : "border-gray-300"}`}
                    >
                      {isSelected && (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  )}

                  {/* サムネイル */}
                  <img
                    src={item.imageUrl}
                    alt="解析した画像"
                    className="w-16 h-16 object-cover rounded-xl flex-shrink-0"
                  />

                  {/* テキスト情報 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 mb-1">{formatDate(item.date)}</p>
                    <p className={`text-2xl font-black leading-none ${getScoreColor(item.result.compatibility_score)}`}>
                      {item.result.compatibility_score}
                      <span className="text-base font-bold">%</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      {item.result.summary}
                    </p>
                  </div>

                  {/* 通常モードのみ右矢印を表示 */}
                  {!isSelectMode && (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 選択モード時の下部固定バー */}
      {isSelectMode && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-4 shadow-lg">
          <div className="max-w-md mx-auto">
            <button
              onClick={handleDeleteSelected}
              disabled={selectedIds.size === 0}
              className={`w-full py-3 rounded-2xl font-bold text-base transition-all ${
                selectedIds.size > 0
                  ? "bg-red-400 text-white hover:bg-red-500 active:scale-95 shadow-md"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
            >
              {selectedIds.size > 0
                ? `選択した ${selectedIds.size} 件を削除`
                : "削除する項目を選択してください"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
