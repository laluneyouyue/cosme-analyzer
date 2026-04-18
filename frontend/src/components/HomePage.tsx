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
  onAnalysisComplete: (result: AnalysisResult, imageUrl: string) => void; // 解析完了時に呼ばれる関数
}

export const HomePage: React.FC<HomePageProps> = ({
  profile,
  onNavigateToProfile,
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
  // ここでは隠れているinput要素をプログラムからクリックするために使う
  const fileInputRef = useRef<HTMLInputElement>(null);

  // カメラボタンを押したときの処理
  // 非表示のinput[type="file"]要素をプログラムからクリックする
  const handleCameraClick = () => {
    fileInputRef.current?.click(); // ?. はオプショナルチェーン：要素がnullでない場合のみ実行
  };

  // ファイルが選択されたときの処理
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // event.target.files: 選択されたファイルの配列
    const file = event.target.files?.[0];
    if (!file) return; // ファイルが選択されていない場合は何もしない

    setSelectedFile(file);
    setError(null);

    // URL.createObjectURL: ファイルオブジェクトからブラウザ内でのみ有効なURLを作成
    // これにより画像をプレビュー表示できる
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
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
        {/* プロファイル設定ボタン */}
        <button
          onClick={onNavigateToProfile}
          className="flex items-center gap-1 bg-pink-50 text-pink-500 px-3 py-1.5 rounded-full text-xs font-medium hover:bg-pink-100 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
          プロファイル
        </button>
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
                コスメの成分表を撮影してください
              </p>
              <p className="text-xs text-gray-400 text-center mt-1">
                パッケージ裏面の成分表示がはっきり映るように撮影すると精度が上がります
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
              {/* 画像を撮り直すボタン */}
              <button
                onClick={handleCameraClick}
                className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-sm text-gray-700 text-xs px-3 py-1.5 rounded-full shadow-md font-medium"
              >
                撮り直す
              </button>
            </div>
          ) : (
            /* 大きなカメラボタン */
            <div className="px-4 pb-4">
              <button
                onClick={handleCameraClick}
                className="w-full bg-gradient-to-br from-pink-400 to-purple-400 rounded-2xl flex flex-col items-center justify-center py-12 gap-3 shadow-inner hover:shadow-lg active:scale-95 transition-all"
                aria-label="カメラを起動して撮影する"
              >
                {/* カメラアイコン（SVG） */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-16 w-16 text-white drop-shadow-md"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <span className="text-white font-bold text-lg drop-shadow">
                  📷 タップして撮影
                </span>
                <span className="text-white/70 text-xs">
                  またはライブラリから選択
                </span>
              </button>
            </div>
          )}
        </div>

        {/* 非表示のファイル入力要素 */}
        {/* capture="environment": スマホの背面カメラを起動する属性 */}
        {/* accept="image/*": 画像ファイルのみ受け付ける */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden" // 非表示にする（ボタンクリックでプログラムから起動する）
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
            <li>📍 成分表示部分にカメラを近づけて撮影</li>
            <li>💡 明るい場所で撮影すると文字が読みやすくなります</li>
            <li>🔍 ブレないようにしっかり固定して撮影</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
