// =============================================================================
// プロファイル設定画面 (ProfilePage.tsx)
// =============================================================================
// ユーザーの肌質やパーソナルカラーなどを設定する画面です。
// 設定した内容はAPIに送信され、成分との相性判定に使われます。
// =============================================================================

import React, { useState } from "react";
import type { UserProfile } from "../types";

// コンポーネントが受け取るプロパティ（props）の型定義
interface ProfilePageProps {
  profile: UserProfile; // 現在のプロファイルデータ
  onSave: (profile: UserProfile) => void; // 保存ボタンを押したときに呼ばれる関数
  onBack: () => void; // 戻るボタンを押したときに呼ばれる関数
}

// 選択肢の定数（変更されないデータ）
const SKIN_TYPES = ["普通肌", "乾燥肌", "脂性肌", "混合肌", "敏感肌", "アトピー肌"];
const PERSONAL_COLORS = [
  "ブルべ夏（サマー）",
  "ブルべ冬（ウィンター）",
  "イエベ春（スプリング）",
  "イエベ秋（オータム）",
  "わからない",
];
const DESIRED_EFFECTS = [
  "保湿・うるおい",
  "透明感・美白",
  "エイジングケア",
  "毛穴・テカリ対策",
  "鎮静・敏感肌ケア",
  "ハリ・ツヤ",
];

export const ProfilePage: React.FC<ProfilePageProps> = ({
  profile,
  onSave,
  onBack,
}) => {
  // useState: コンポーネント内で変化するデータ（状態）を管理するReactの仕組み
  // localProfile: 画面上で編集中のプロファイルデータ
  // setLocalProfile: localProfileを更新するための関数
  const [localProfile, setLocalProfile] = useState<UserProfile>(profile);

  // 保存ボタンを押したときの処理
  const handleSave = () => {
    onSave(localProfile); // 親コンポーネントに更新したプロファイルを渡す
  };

  // フィールドの値が変わったときにlocalProfileを更新するヘルパー関数
  // keyof UserProfile: UserProfileの中のキー名（プロパティ名）の型
  const handleChange = (field: keyof UserProfile, value: string) => {
    // スプレッド演算子（...）: 既存のオブジェクトをコピーして一部だけ上書きする
    setLocalProfile((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-purple-50">
      {/* ヘッダー */}
      <div className="bg-white shadow-sm px-4 py-3 flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-pink-400 hover:text-pink-600 transition-colors"
          aria-label="戻る"
        >
          {/* 左矢印アイコン */}
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
        <h1 className="text-lg font-semibold text-gray-800">
          マイプロファイル設定
        </h1>
      </div>

      {/* メインコンテンツ */}
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* 説明テキスト */}
        <p className="text-sm text-gray-500 text-center">
          プロファイルを設定すると、あなたにぴったりの成分解析が行えます 🌸
        </p>

        {/* 肌質の選択 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            🧴 肌質
          </label>
          {/* グリッドレイアウトで選択肢を並べる */}
          <div className="grid grid-cols-2 gap-2">
            {SKIN_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => handleChange("skin_type", type)}
                className={`py-2 px-3 rounded-xl text-sm font-medium transition-all ${
                  localProfile.skin_type === type
                    ? "bg-pink-400 text-white shadow-md" // 選択中のスタイル
                    : "bg-gray-100 text-gray-600 hover:bg-pink-100" // 未選択のスタイル
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* パーソナルカラーの選択 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            🎨 パーソナルカラー
          </label>
          <div className="space-y-2">
            {PERSONAL_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => handleChange("personal_color", color)}
                className={`w-full py-2 px-4 rounded-xl text-sm font-medium text-left transition-all ${
                  localProfile.personal_color === color
                    ? "bg-purple-400 text-white shadow-md"
                    : "bg-gray-100 text-gray-600 hover:bg-purple-100"
                }`}
              >
                {color}
              </button>
            ))}
          </div>
        </div>

        {/* 重視する効果（複数選択風に見せる入力欄） */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            ✨ 重視する効果
          </label>
          <div className="grid grid-cols-2 gap-2">
            {DESIRED_EFFECTS.map((effect) => (
              <button
                key={effect}
                onClick={() => handleChange("desired_effects", effect)}
                className={`py-2 px-3 rounded-xl text-sm font-medium transition-all ${
                  localProfile.desired_effects === effect
                    ? "bg-emerald-400 text-white shadow-md"
                    : "bg-gray-100 text-gray-600 hover:bg-emerald-100"
                }`}
              >
                {effect}
              </button>
            ))}
          </div>
        </div>

        {/* 避けたい成分（テキスト入力） */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            🚫 避けたい成分
          </label>
          <p className="text-xs text-gray-400 mb-2">
            例: エタノール、香料、パラベン（カンマ区切りで複数入力可）
          </p>
          {/* textarea: 複数行のテキスト入力欄 */}
          <textarea
            value={localProfile.avoid_ingredients}
            onChange={(e) =>
              handleChange("avoid_ingredients", e.target.value)
            }
            rows={3}
            placeholder="エタノール, 香料"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"
          />
        </div>

        {/* 保存ボタン */}
        <button
          onClick={handleSave}
          className="w-full bg-gradient-to-r from-pink-400 to-purple-400 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:shadow-xl active:scale-95 transition-all"
        >
          プロファイルを保存する
        </button>
      </div>
    </div>
  );
};
