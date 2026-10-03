# GitHub mainからの自動公開

公開元は `https://github.com/nobinko/mtg-token` の `main` です。公開先は `.openai/hosting.json` の `appgprj_6ac055f0be7c8191bb686c041d36c953` を使います。GitHubへのpush直後の直接デプロイではなく、Sitesのクラウドタスクが最新版を定期確認して反映します。PCを起動しておく必要はありません。

## 各回の手順

1. Sitesの`get_site`で同じ公開先を開き、公開状態・所有権・アクセス設定を確認します。アクセス設定、既存のパスワード用シークレット、D1/R2の論理名を変更しません。
2. GitHubの`main`のHEADを`git ls-remote https://github.com/nobinko/mtg-token.git refs/heads/main`で読みます。Sitesのバージョン一覧と各デプロイの状態を読み、最新の成功した公開版の`source.commit_sha`と比べます。同じなら作業を終えます。進行中の公開がある場合はその結果を先に確認し、重複して公開しません。
3. 更新がある場合、Sitesのネイティブツールで同じプロジェクトの短期ソース書き込み資格情報を取得します。資格情報はセッションメモリと非表示stdinだけで扱い、ファイル、コマンド引数、GitHubシークレット、ログ、タスクのプロンプトに保存しません。Sites hostingスキルの`site-workflow.mjs`をアーカイブ指定なしで実行し、返されたcheckoutを使います。
4. そのcheckoutで`git fetch https://github.com/nobinko/mtg-token.git refs/heads/main`、続いて`git merge --ff-only FETCH_HEAD`を実行します。履歴が分岐している場合は公開を止めて報告します。force-pushや自動マージで解決しません。`main`の内容を修正・補完せず、そのまま使います。
5. lockfileどおりに依存をインストールします。Sitesのインストールヘルパーを使い、環境固有のヘルパー実行エラーの場合のみ通常の`npm ci`で同じlockfileを使います。
6. Sites hostingの公開ワークフローを、開いた結果を`source`として渡し、以下の`commands`で実行します。アーカイブは絶対パスに置きます。

   ```json
   [
     ["node", "scripts/assert-github-head.mjs"],
     ["node", "--test"],
     ["node", "scripts/build-hosted.mjs"],
     ["node", "scripts/verify-hosted.mjs", "--release"],
     ["node", "scripts/assert-github-head.mjs"]
   ]
   ```

   WindowsではGit BashをPATHの先頭に追加し、`TAR_OPTIONS=--force-local`を設定します。Linuxでは通常のbash/tarを使います。

7. ワークフローが返した`commit_sha`がGitHubの`main`の対象SHAと一致することを確認します。公開直前にGitHubのHEADを再確認し、変わっていれば古いビルドを公開せず、最新のHEADでやり直します。
8. ネイティブの`save_site_version`にワークフローが返したプロジェクトID・SHA・アーカイブを渡し、その保存済みバージョンを`deploy_site_version`で公開します。新しいサイトを作りません。既存の公開URLとアクセス設定を維持します。
9. デプロイが`succeeded`になるまで状態を確認します。保存したバージョンの`source.commit_sha`が対象のGitHub SHAに一致し、成功結果のURLが既存の公開先であることを確認します。公開済みURLへの追加ブラウザQAは不要です。

## 失敗と通知

テスト・認証確認・ビルド・SHA確認が失敗したら、既存の公開版を維持して失敗を報告します。ソースは自動修正しません。決定的なマイグレーションエラーは同じアーカイブで繰り返さず、失敗箇所を報告します。通常の短期資格情報の期限切れは同じSiteで再取得して続行します。更新がない通常回は通知せず、新版の公開完了、失敗、人の操作が必要な場合だけ知らせます。

## 公開版の照合

ビルドには元コミットのSHAと未コミット変更の有無を埋め込みます。ログイン後の`GET /api/version`、または`dist/build-info.json`で照合できます。GitHub Actionsも同じコミットでテスト・公開用ビルド・認証と保存領域の確認を実行し、SHA付きのビルド成果物を保存します。これだけでSitesへの公開が完了するわけではなく、公開は上記のクラウドタスクが担当します。
