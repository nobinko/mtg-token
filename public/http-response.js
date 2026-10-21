export async function readApiResponse(response) {
  try {
    return await response.json();
  } catch {
    if ([502, 503, 504, 524].includes(response.status)) {
      throw new Error("取得先またはサーバーの応答が時間内に戻りませんでした。取得元やリスト数を絞って、もう一度お試しください。");
    }
    throw new Error("サーバーから正常な応答を受け取れませんでした。ページを再読み込みして、もう一度お試しください。");
  }
}
