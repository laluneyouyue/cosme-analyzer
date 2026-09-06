// =============================================================================
// プロファイル設定画面 (ProfilePage.tsx)
// =============================================================================
// ユーザーの肌質・年代・重視する効果を設定する画面です。
// ここで設定した内容が、解析結果の「あなたが求めるもの」になります。
//
// 【重視する効果は複数選択】
// 以前は見た目が複数選択なのに実際は1つしか選べない状態でした。
// 相性スコアは「選んだ効果をどれだけ満たせたか」で決まるため、
// ここが1つしか選べないと評価の幅が出ません。複数選択に直しています。
//
// 【選択肢は5軸と1対1】
// 効果の選択肢は types.ts の AXIS_LABELS をそのまま使っています。
// 画面の選択肢とレーダーの軸を別々に書くと、
// 「選べるのにグラフに出ない効果」が生まれてしまうためです。
// =============================================================================

import React, { useState } from "react";
import type { UserProfile } from "../types";
import { AXES, AXIS_LABELS } from "../types";

// コンポーネントが受け取るプロパティ（props）の型定義
interface ProfilePageProps {
  profile: UserProfile; // 現在のプロファイルデータ
  onSave: (profile: UserProfile) => void; // 保存ボタンを押したときに呼ばれる関数
  onBack: () => void; // 戻るボタンを押したときに呼ばれる関数
}

// 選択肢の定数（変更されないデータ）
const SKIN_TYPES = ["普通肌", "乾燥肌", "脂性肌", "混合肌", "敏感肌", "アトピー肌"];

// 年代は backend/config.py の AGE_ADJUSTMENTS のキーと一致させる。
// ここがずれると年齢による補正が効かなくなる（無言で無視される）。
const AGE_GROUPS = ["10代", "20代", "30代", "40代", "50代以上"];

const PERSONAL_COLORS = [
  "ブルべ夏（サマー）",
  "ブルべ冬（ウィンター）",
  "イエベ春（スプリング）",
  "イエベ秋（オータム）",
  "わからない",
];

// 重視する効果は5軸の正式名称そのもの
const DESIRED_EFFECTS = AXES.map((axis) => AXIS_LABELS[axis]);

// 同時に選べる効果の上限。
// 全部選ぶと「何も重視していない」のと同じ意味になり、
// 相性スコアが製品の平均点に近づいてしまうため上限を設けています。
const MAX_EFFECTS = 3;

export const ProfilePage: React.FC<ProfilePageProps> = ({
  profile,
  onSave,
  onBack,
}) => {
  // useState: コンポーネント内で変化するデータ（状態）を管理するReactの仕組み
  // localProfile: 画面上で編集中のプロファイルデータ
  const [localProfile, setLocalProfile] = useState<UserProfile>(profile);

  // 保存ボタンを押したときの処理
  const handleSave = () => {
    onSave(localProfile); // 親コンポーネントに更新したプロファイルを渡す
  };

  // 文字列の項目を更新するヘルパー関数
  // keyof UserProfile: UserProfileの中のキー名（プロパティ名）の型
  const handleChange = (field: keyof UserProfile, value: string) => {
    // スプレッド演算子（...）: 既存のオブジェクトをコピーして一部だけ上書きする
    setLocalProfile((prev) => ({ ...prev, [field]: value }));
  };

  // 重視する効果のON/OFFを切り替える
  const toggleEffect = (effect: string) => {
    setLocalProfile((prev) => {
      const selected = prev.desired_effects;
      if (selected.includes(effect)) {
        // すでに選ばれている → 外す
        return {
          ...prev,
          desired_effects: selected.filter((item) => item !== effect),
        };
      }
      // 上限に達していたら何もしない（押しても反応しない）
      if (selected.length >= MAX_EFFECTS) return prev;
      return { ...prev, desired_effects: [...selected, effect] };
    });
  };

  const selectedCount = localProfile.desired_effects.length;

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

        {/* 肌質の選択 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            🧴 肌質
          </label>
          <p className="text-xs text-gray-400 mb-3">
            敏感肌・アトピー肌を選ぶと、刺激リスクの減点を強めに評価します
          </p>
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

        {/* 年代の選択 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            🎂 年代
          </label>
          <p className="text-xs text-gray-400 mb-3">
            同じ成分でも年代によって必要度が変わるため、求める水準を調整します
          </p>
          <div className="grid grid-cols-3 gap-2">
            {AGE_GROUPS.map((age) => (
              <button
                key={age}
                onClick={() => handleChange("age_group", age)}
                className={`py-2 px-2 rounded-xl text-sm font-medium transition-all ${
                  localProfile.age_group === age
                    ? "bg-pink-400 text-white shadow-md"
                    : "bg-gray-100 text-gray-600 hover:bg-pink-100"
                }`}
              >
                {age}
              </button>
            ))}
          </div>
        </div>

        {/* 重視する効果（複数選択） */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-baseline justify-between mb-1">
            <label className="block text-sm font-semibold text-gray-700">
              ✨ 重視する効果
            </label>
            <span className="text-xs text-gray-400">
              {selectedCount} / {MAX_EFFECTS} 個
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            最大{MAX_EFFECTS}つまで選べます。ここで選んだ効果を製品がどれだけ
            満たせているかが、相性スコアになります
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DESIRED_EFFECTS.map((effect) => {
              const isSelected = localProfile.desired_effects.includes(effect);
              // 上限に達していて、かつ未選択のボタンは押せないことを見た目で示す
              const isDisabled = !isSelected && selectedCount >= MAX_EFFECTS;
              return (
                <button
                  key={effect}
                  onClick={() => toggleEffect(effect)}
                  disabled={isDisabled}
                  className={`py-2 px-3 rounded-xl text-sm font-medium transition-all ${
                    isSelected
                      ? "bg-emerald-400 text-white shadow-md"
                      : isDisabled
                      ? "bg-gray-50 text-gray-300 cursor-not-allowed"
                      : "bg-gray-100 text-gray-600 hover:bg-emerald-100"
                  }`}
                >
                  {effect}
                </button>
              );
            })}
          </div>
          {selectedCount === 0 && (
            <p className="text-xs text-amber-600 mt-3">
              ひとつも選んでいない場合は、製品の得意分野をそのまま表示します
            </p>
          )}
        </div>

        {/* 避けたい成分（テキスト入力） */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            🚫 避けたい成分
          </label>
          <p className="text-xs text-gray-400 mb-2">
            例: エタノール、香料、パラベン（カンマ区切りで複数入力可）。
            「香料」と書くと「合成香料」なども対象になります
          </p>
          {/* textarea: 複数行のテキスト入力欄 */}
          <textarea
            value={localProfile.avoid_ingredients}
            onChange={(e) => handleChange("avoid_ingredients", e.target.value)}
            rows={3}
            placeholder="エタノール, 香料"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"
          />
        </div>

        {/* パーソナルカラー（現在は解析に使っていない） */}
        <div className="bg-white rounded-2xl p-4 shadow-sm opacity-90">
          <div className="flex items-center gap-2 mb-1">
            <label className="block text-sm font-semibold text-gray-700">
              🎨 パーソナルカラー
            </label>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
              今後実装予定
            </span>
          </div>
          {/* なぜ使っていないかを画面にも書いておく。
              設定できるのに結果に反映されないと、不具合に見えるため。 */}
          <p className="text-xs text-gray-400 mb-3">
            現在この項目は解析に使っていません。パーソナルカラーは似合う「色」の
            話で、成分表からは判断できないためです。色を扱う機能を作るときに
            使う予定です
          </p>
          <div className="space-y-2">
            {PERSONAL_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => handleChange("personal_color", color)}
                className={`w-full py-2 px-4 rounded-xl text-sm font-medium text-left transition-all ${
                  localProfile.personal_color === color
                    ? "bg-purple-300 text-white shadow-sm"
                    : "bg-gray-50 text-gray-500 hover:bg-purple-50"
                }`}
              >
                {color}
              </button>
            ))}
          </div>
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
