// =============================================================================
// アプリのルートコンポーネント (App.tsx)
// =============================================================================
// このファイルはアプリ全体の「司令塔」です。
// 現在どの画面を表示するかを管理し、各画面コンポーネントを切り替えます。
//
// 【画面の流れ】
// ホーム画面 → カメラで撮影 → 解析中 → 結果画面
//      ↕                                    ↕
//   履歴画面 ←←←←←←←←←←←←←←←←←←←←←↙
//      ↕（プロファイル設定画面はいつでも行き来できる）
// =============================================================================

import { useState } from "react";
import "./index.css";

// 各画面コンポーネントをimport
import { HomePage } from "./components/HomePage";
import { ProfilePage } from "./components/ProfilePage";
import { ResultPage } from "./components/ResultPage";
import { HistoryPage } from "./components/HistoryPage";

// 型定義をimport
import type { AppPage, UserProfile, AnalysisResult, HistoryItem } from "./types";

// =============================================================================
// localStorage のキー定数
// =============================================================================
const PROFILE_KEY = "cosme_analyzer_profile";
const HISTORY_KEY = "cosme_analyzer_history";

// 履歴の最大保存件数
// localStorageには容量制限（約5MB）があるため、古い履歴は削除する
const MAX_HISTORY = 20;

// デフォルトのユーザープロファイル（初回起動時の初期値）
const DEFAULT_PROFILE: UserProfile = {
  skin_type: "敏感肌",
  personal_color: "ブルべ夏（サマー）",
  desired_effects: "保湿・うるおい",
  avoid_ingredients: "エタノール, 香料",
};

// =============================================================================
// localStorage ユーティリティ関数
// =============================================================================

/**
 * localStorageからプロファイルを読み込む
 * 保存データがない・読み込み失敗時はデフォルト値を返す
 */
function loadProfile(): UserProfile {
  try {
    const saved = localStorage.getItem(PROFILE_KEY);
    if (!saved) return DEFAULT_PROFILE;
    return JSON.parse(saved) as UserProfile;
  } catch {
    return DEFAULT_PROFILE;
  }
}

/**
 * localStorageから履歴リストを読み込む
 * データがない・読み込み失敗時は空配列を返す
 */
function loadHistory(): HistoryItem[] {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (!saved) return [];
    return JSON.parse(saved) as HistoryItem[];
  } catch {
    return [];
  }
}

/**
 * 解析結果を履歴に追加して localStorage に保存する
 * @param current - 現在の履歴配列
 * @param result  - 新しい解析結果
 * @param imageUrl - 解析した画像のdata URL
 * @returns 更新後の履歴配列
 */
function addToHistory(
  current: HistoryItem[],
  result: AnalysisResult,
  imageUrl: string
): HistoryItem[] {
  const newItem: HistoryItem = {
    // Date.now(): 現在時刻をミリ秒で返す。一意なIDとして利用
    id: String(Date.now()),
    // new Date().toISOString(): "2025-04-18T12:34:56.789Z" 形式の日時文字列
    date: new Date().toISOString(),
    imageUrl,
    result,
  };

  // スプレッド構文で新しい配列を作り、末尾に新アイテムを追加
  const updated = [...current, newItem];

  // 最大件数を超えた場合は古い履歴を先頭から削除する
  // slice(-MAX_HISTORY): 末尾から MAX_HISTORY 件だけ取り出す
  const trimmed = updated.slice(-MAX_HISTORY);

  // JSON.stringify: オブジェクト → 文字列に変換してから保存
  // try/catch: localStorage は容量上限（約5〜10MB）を超えると例外を投げるため必須
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch (e) {
    // QuotaExceededError: 容量超過。古い履歴を半分に減らして再試行する
    console.warn("localStorage 容量超過。履歴を削減します:", e);
    const reduced = trimmed.slice(-Math.floor(MAX_HISTORY / 2));
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(reduced));
      return reduced;
    } catch {
      // それでも失敗した場合は保存をスキップ（メモリ上の履歴は維持）
      console.error("履歴の保存に失敗しました。");
    }
  }

  return trimmed;
}

// =============================================================================
// App コンポーネント
// =============================================================================

function App() {
  // 現在表示している画面
  const [currentPage, setCurrentPage] = useState<AppPage>("home");

  // ユーザープロファイル（起動時に localStorage から復元）
  const [userProfile, setUserProfile] = useState<UserProfile>(loadProfile);

  // 解析結果（バックエンドAPIから返ってくるデータ）
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  // 解析した画像のdata URL（結果画面・履歴のサムネイル用）
  const [analyzedImageUrl, setAnalyzedImageUrl] = useState<string>("");

  // 解析履歴リスト（起動時に localStorage から復元）
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);

  // ==========================================================================
  // イベントハンドラ
  // ==========================================================================

  // プロファイルを保存してホーム画面に戻る
  const handleProfileSave = (profile: UserProfile) => {
    setUserProfile(profile);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    setCurrentPage("home");
  };

  // 解析が完了したときの処理
  const handleAnalysisComplete = (result: AnalysisResult, imageUrl: string) => {
    // 結果を表示用に保持
    setAnalysisResult(result);
    setAnalyzedImageUrl(imageUrl);

    // 履歴に追加して localStorage に永続化
    const updated = addToHistory(history, result, imageUrl);
    setHistory(updated);

    setCurrentPage("result");
  };

  // ホーム画面に戻る
  const handleBackToHome = () => {
    setCurrentPage("home");
    setAnalysisResult(null);
    setAnalyzedImageUrl("");
  };

  // 履歴の特定アイテムを選択して結果画面を再表示する
  const handleSelectHistory = (result: AnalysisResult, imageUrl: string) => {
    setAnalysisResult(result);
    setAnalyzedImageUrl(imageUrl);
    setCurrentPage("result");
  };

  // 指定した ID の履歴を削除する
  // ids: 削除したいアイテムの id 配列
  const handleDeleteItems = (ids: string[]) => {
    // Set に変換すると「含まれているか」の判定が高速になる
    const deleteSet = new Set(ids);
    // filter: 条件に合うものだけ残した新しい配列を返す
    const updated = history.filter((item) => !deleteSet.has(item.id));
    setHistory(updated);
    // 更新した履歴を localStorage に上書き保存
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    } catch {
      console.error("履歴の保存に失敗しました。");
    }
  };

  // ==========================================================================
  // 画面の切り替え（条件付きレンダリング）
  // ==========================================================================

  if (currentPage === "profile") {
    return (
      <ProfilePage
        profile={userProfile}
        onSave={handleProfileSave}
        onBack={() => setCurrentPage("home")}
      />
    );
  }

  if (currentPage === "history") {
    return (
      <HistoryPage
        history={history}
        onBack={handleBackToHome}
        onSelectItem={handleSelectHistory}
        onDeleteItems={handleDeleteItems}
      />
    );
  }

  if (currentPage === "result" && analysisResult) {
    return (
      <ResultPage
        result={analysisResult}
        imageUrl={analyzedImageUrl}
        onBack={handleBackToHome}
      />
    );
  }

  // デフォルト: ホーム画面を表示
  return (
    <HomePage
      profile={userProfile}
      onNavigateToProfile={() => setCurrentPage("profile")}
      onNavigateToHistory={() => setCurrentPage("history")}
      onAnalysisComplete={handleAnalysisComplete}
    />
  );
}

export default App;
