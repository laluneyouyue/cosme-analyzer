// =============================================================================
// アプリのルートコンポーネント (App.tsx)
// =============================================================================
// このファイルはアプリ全体の「司令塔」です。
// 現在どの画面を表示するかを管理し、各画面コンポーネントを切り替えます。
//
// 【画面の流れ】
// ホーム画面 → カメラで撮影 → 解析中 → 結果画面
//      ↕（プロファイル設定画面はいつでも行き来できる）
// =============================================================================

import { useState } from "react";
import "./index.css";

// 各画面コンポーネントをimport
import { HomePage } from "./components/HomePage";
import { ProfilePage } from "./components/ProfilePage";
import { ResultPage } from "./components/ResultPage";

// 型定義をimport
import type { AppPage, UserProfile, AnalysisResult } from "./types";

// デフォルトのユーザープロファイル（初回起動時の初期値）
const DEFAULT_PROFILE: UserProfile = {
  skin_type: "敏感肌",
  personal_color: "ブルべ夏（サマー）",
  desired_effects: "保湿・うるおい",
  avoid_ingredients: "エタノール, 香料",
};

function App() {
  // ==========================================================================
  // 状態（State）の管理
  // ==========================================================================
  // useState: コンポーネントの中で変化するデータを管理するReactの仕組み
  //           [現在の値, 値を変更する関数] = useState(初期値) という形で使う

  // 現在表示している画面
  const [currentPage, setCurrentPage] = useState<AppPage>("home");

  // ユーザープロファイル（肌質、パーソナルカラーなど）
  const [userProfile, setUserProfile] = useState<UserProfile>(DEFAULT_PROFILE);

  // 解析結果（バックエンドAPIから返ってくるデータ）
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  // 解析した画像のURL（結果画面でサムネイルとして表示するため）
  const [analyzedImageUrl, setAnalyzedImageUrl] = useState<string>("");

  // ==========================================================================
  // イベントハンドラ（各操作に対する処理）
  // ==========================================================================

  // プロファイルを保存してホーム画面に戻る
  const handleProfileSave = (profile: UserProfile) => {
    setUserProfile(profile);
    setCurrentPage("home");
  };

  // 解析が完了したときの処理
  // - 結果データと画像URLを保存
  // - 結果画面に遷移
  const handleAnalysisComplete = (result: AnalysisResult, imageUrl: string) => {
    setAnalysisResult(result);
    setAnalyzedImageUrl(imageUrl);
    setCurrentPage("result");
  };

  // ホーム画面に戻る（結果をリセットする）
  const handleBackToHome = () => {
    setCurrentPage("home");
    setAnalysisResult(null); // 前の解析結果をクリア
    setAnalyzedImageUrl("");
  };

  // ==========================================================================
  // 画面の切り替え（条件付きレンダリング）
  // ==========================================================================
  // currentPage の値に応じて、表示するコンポーネントを切り替える
  // これが「シングルページアプリケーション（SPA）」のページ遷移の仕組み

  if (currentPage === "profile") {
    return (
      <ProfilePage
        profile={userProfile}
        onSave={handleProfileSave}
        onBack={() => setCurrentPage("home")}
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
      onAnalysisComplete={handleAnalysisComplete}
    />
  );
}

export default App;
