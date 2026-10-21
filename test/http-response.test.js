import test from "node:test";
import assert from "node:assert/strict";
import { readApiResponse } from "../public/http-response.js";

test("API responses preserve structured success and validation errors", async () => {
  assert.deepEqual(await readApiResponse(Response.json({ groups: [] })), { groups: [] });
  assert.deepEqual(await readApiResponse(Response.json({ error: "入力を確認してください" }, { status: 400 })), { error: "入力を確認してください" });
});

test("gateway HTML errors become actionable messages without reflecting the body", async () => {
  await assert.rejects(readApiResponse(new Response("<html>gateway diagnostic</html>", { status: 504 })), error => {
    assert.match(error.message, /時間内/);
    assert.doesNotMatch(error.message, /html|gateway diagnostic|Unexpected/);
    return true;
  });
  await assert.rejects(readApiResponse(new Response("<html>unexpected page</html>")), /再読み込み/);
});
