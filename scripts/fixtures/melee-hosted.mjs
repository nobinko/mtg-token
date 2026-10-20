import assert from "node:assert/strict";

// Upstream fixtures for the actual Worker fetch path. They are never bundled
// into the app and do not claim that the live Melee service is available.
export function meleeHostedFixture() {
  const calls = [];
  const id = 123;
  const deckId = "00000000-0000-0000-0000-000000000001";
  const startDate = new Date(Date.now() - 86400000).toISOString();
  return {
    calls,
    tournamentUrl: `https://melee.gg/Tournament/View/${id}`,
    async fetch(request) {
      const url = new URL(request.url);
      calls.push(url.href);
      if (url.hostname !== "melee.gg") {
        assert.notEqual(url.hostname, "redirect-target.invalid", "Melee redirects must not be followed");
        return fetch(request);
      }
      const json = value => Response.json(value);
      if (url.pathname.startsWith("/api/")) {
        assert.ok(request.headers.get("authorization")?.startsWith("Basic "));
        return new Response("private-upstream-body", { status: 302, headers: { location: "https://redirect-target.invalid/" } });
      }
      assert.equal(request.headers.get("authorization"), null);
      if (url.pathname === "/Tournament/TournamentSearch") {
        assert.equal(request.method, "POST");
        const form = new URLSearchParams(await request.text());
        assert.ok(form.getAll("filters[]").includes("Modern"));
        return json({ recordsTotal: 1, data: [{ id, name: "Hosted transport fixture", startDate, gameDescription: "Magic: The Gathering", formatString: "Modern", enrolledPlayerCount: 1, organizationName: "Verification" }] });
      }
      if (url.pathname === `/Tournament/View/${id}`) return new Response(`<input name="tournament-id" value="${id}"><a data-type="venue" data-id="456"></a><button class="round-selector" data-id="789"></button>`);
      if (url.pathname === "/Venue/GetDetails") return json({ AddressCountry: "JP", Name: "Verification venue" });
      if (url.pathname === "/Tournament/GetTournamentDetails") return json({ ID: id, Name: "Hosted transport fixture", StartDate: startDate, Format: "Modern", ParticipatorCount: 1 });
      if (url.pathname === "/Standing/GetRoundStandings") return json({ recordsTotal: 1, data: [{ TournamentId: id, TeamId: 1, Team: { Players: [{ ID: 1, DisplayName: "Verification" }] }, Decklists: [{ DecklistId: deckId, PlayerId: 1, Format: "Modern" }] }] });
      if (url.pathname === "/Decklist/GetDecklistDetails") return json({ Guid: deckId, Game: "MagicTheGathering", FormatName: "Modern", DecklistName: "Verification", Records: [{ n: "Island", q: 60, c: 0 }, { n: "Dispel", q: 15, c: 99 }] });
      assert.fail(`Unexpected Melee fixture path: ${url.pathname}`);
    }
  };
}
