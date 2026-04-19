// =============================================================================
// ホーム画面（カメラ撮影画面）(HomePage.tsx)
// =============================================================================
// アプリのメイン画面です。
// 大きなカメラボタンを配置し、スマホの背面カメラを起動して
// コスメのパッケージを撮影できます。
// =============================================================================

import React, { useRef, useState } from "react";
import type { UserProfile, AnalysisResult } from "../types";
import { analyzeCosmetic } from "../api";

interface HomePageProps {
  profile: UserProfile; // ユーザープロファイル
  onNavigateToProfile: () => void; // プロファイル設定画面に移動する関数
  onNavigateToHistory: () => void; // 履歴画面に移動する関数
  onAnalysisComplete: (result: AnalysisResult, imageUrl: string) => void; // 解析完了時に呼ばれる関数
}

export const HomePage: React.FC<HomePageProps> = ({
  profile,
  onNavigateToProfile,
  onNavigateToHistory,
  onAnalysisComplete,
}) => {
  // ローディング状態（解析中かどうか）
  const [isLoading, setIsLoading] = useState(false);
  // エラーメッセージ
  const [error, setError] = useState<string | null>(null);
  // 選択した画像のプレビューURL
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // 選択した画像ファイル
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // useRef: DOMの要素に直接アクセスするためのReactの仕組み
  // カメラ用とライブラリ用で input 要素を分けることで、それぞれの動作を確実に制御する
  const cameraInputRef = useRef<HTMLInputElement>(null);   // capture="environment" あり → カメラ直起動
  const libraryInputRef = useRef<HTMLInputElement>(null);  // capture なし → ライブラリ選択

  // カメラボタンを押したときの処理
  const handleCameraClick = () => {
    cameraInputRef.current?.click();
  };

  // ライブラリボタンを押したときの処理
  const handleLibraryClick = () => {
    libraryInputRef.current?.click();
  };

  // ファイルが選択されたときの処理
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // event.target.files: 選択されたファイルの配列
    const file = event.target.files?.[0];
    if (!file) return; // ファイルが選択されていない場合は何もしない

    setSelectedFile(file);
    setError(null);

    // FileReader: ファイルをブラウザで非同期に読み込むためのWeb API
    // readAsDataURL を使うと画像を Base64 の data URL（文字列）として読み込める。
    // data URL は localStorage に保存できるため、履歴機能で画像を永続化できる。
    // （URL.createObjectURL は一時的なURLでページ更新後に無効になるため使わない）
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // 解析ボタンを押したときの処理
  const handleAnalyze = async () => {
    if (!selectedFile) {
      setError("画像を選択してください");
      return;
    }

    setIsLoading(true); // ローディング開始
    setError(null);

    try {
      // APIに画像とプロファイルを送って解析結果を取得
      // await: 非同期処理（時間がかかる処理）が完了するまで待つ
      const result = await analyzeCosmetic(selectedFile, profile);

      // 解析完了！親コンポーネントに結果を渡す
      onAnalysisComplete(result, previewUrl!);
    } catch (err) {
      // エラーが発生した場合の処理
      // axiosのエラーかどうかを確認して、適切なエラーメッセージを表示
      if (err instanceof Error) {
        setError(
          `解析に失敗しました。バックエンドサーバーが起動しているか確認してください。\n(${err.message})`
        );
      } else {
        setError("予期せぬエラーが発生しました。");
      }
    } finally {
      // try/catchが終わった後に必ず実行される（成功・失敗に関わらず）
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-purple-50">
      {/* ヘッダー */}
      <div className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-800">
            コスメ成分チェッカー
          </h1>
          <p className="text-xs text-gray-400">✨ あなたの肌に合う成分を発見</p>
        </div>
        {/* 右側ボタングループ */}
        <div className="flex items-center gap-2">
          {/* 履歴ボタン */}
          <button
            onClick={onNavigateToHistory}
            className="flex items-center gap-1 bg-purple-50 text-purple-500 px-3 py-1.5 rounded-full text-xs font-medium hover:bg-purple-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            履歴
          </button>
          {/* プロファイル設定ボタン */}
          <button
            onClick={onNavigateToProfile}
            className="flex items-center gap-1 bg-pink-50 text-pink-500 px-3 py-1.5 rounded-full text-xs font-medium hover:bg-pink-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            設定
          </button>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="max-w-md mx-auto px-4 py-6 space-y-5">

        {/* プロファイルサマリー表示 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 mb-2">
            現在のプロファイル
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="bg-pink-100 text-pink-600 text-xs px-2 py-1 rounded-full">
              {profile.skin_type}
            </span>
            <span className="bg-purple-100 text-purple-600 text-xs px-2 py-1 rounded-full">
              {profile.personal_color}
            </span>
            <span className="bg-emerald-100 text-emerald-600 text-xs px-2 py-1 rounded-full">
              {profile.desired_effects}
            </span>
          </div>
        </div>

        {/* カメラ撮影エリア */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* 撮影エリアの説明 */}
          {!previewUrl && (
            <div className="px-4 pt-4 pb-2">
              <p className="text-sm font-semibold text-gray-700 text-center">
                コスメのパッケージを撮影してください
              </p>
              <p className="text-xs text-gray-400 text-center mt-1">
                成分表がなくても商品名からAIが自動で成分を調べます 🔍
              </p>
            </div>
          )}

          {/* 画像プレビュー表示エリア */}
          {previewUrl ? (
            <div className="relative">
              {/* 撮影した画像のプレビュー */}
              <img
                src={previewUrl}
                alt="撮影した画像のプレビュー"
                className="w-full object-cover max-h-72"
              />
              {/* 撮り直す / ライブラリから選び直す */}
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button
                  onClick={handleLibraryClick}
                  className="bg-white/90 backdrop-blur-sm text-gray-700 text-xs px-3 py-1.5 rounded-full shadow-md font-medium"
                >
                  ライブラリ
                </button>
                <button
                  onClick={handleCameraClick}
                  className="bg-white/90 backdrop-blur-sm text-gray-700 text-xs px-3 py-1.5 rounded-full shadow-md font-medium"
                >
                  撮り直す
                </button>
              </div>
            </div>
          ) : (
            /* カメラ・ライブラリ選択ボタン */
            <div className="px-4 pb-4 space-y-3">
              {/* カメラ起動ボタン（大） */}
              <button
                onClick={handleCameraClick}
                className="w-full bg-gradient-to-br from-pink-400 to-purple-400 rounded-2xl flex flex-col items-center justify-center py-10 gap-3 shadow-inner hover:shadow-lg active:scale-95 transition-all"
                aria-label="カメラを起動して撮影する"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-14 w-14 text-white drop-shadow-md"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-white font-bold text-lg drop-shadow">
                  📷 カメラで撮影
                </span>
              </button>

              {/* ライブラリ選択ボタン */}
              {/* capture属性を付けないことでフォトライブラリが開く */}
              <button
                onClick={handleLibraryClick}
                className="w-full bg-white border-2 border-pink-200 rounded-2xl flex items-center justify-center gap-2 py-3 hover:bg-pink-50 active:scale-95 transition-all"
                aria-label="フォトライブラリから画像を選択する"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-pink-500 font-medium text-sm">
                  ライブラリから選択
                </span>
              </button>
            </div>
          )}
        </div>

        {/* 非表示のファイル入力要素（カメラ用） */}
        {/* capture="environment": この属性があるとスマホの背面カメラを直接起動する */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
        />

        {/* 非表示のファイル入力要素（ライブラリ用） */}
        {/* capture属性なし: フォトライブラリの選択ダイアログが開く */}
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
        />

        {/* エラーメッセージ */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <p className="text-red-600 text-sm whitespace-pre-line">{error}</p>
          </div>
        )}

        {/* 解析ボタン */}
        {selectedFile && (
          <button
            onClick={handleAnalyze}
            disabled={isLoading}
            className={`w-full py-4 rounded-2xl font-bold text-lg shadow-lg transition-all ${
              isLoading
                ? "bg-gray-300 text-gray-500 cursor-not-allowed" // ローディング中のスタイル
                : "bg-gradient-to-r from-pink-400 to-purple-500 text-white hover:shadow-xl active:scale-95"
            }`}
          >
            {isLoading ? (
              /* ローディング中のアニメーション表示 */
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                AI解析中... しばらくお待ちください
              </span>
            ) : (
              "✨ 成分を解析する"
            )}
          </button>
        )}

        {/* 使い方のヒント */}
        <div className="bg-white/60 rounded-2xl p-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">
            💡 使い方のコツ
          </p>
          <ul className="text-xs text-gray-400 space-y-1 list-none">
            <li>📦 成分表がなくてもOK！商品名が見えればAIが調べます</li>
            <li>💡 明るい場所で撮影すると文字が読みやすくなります</li>
            <li>🔍 ブレないようにしっかり固定して撮影</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
