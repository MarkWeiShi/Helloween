import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(process.env.DATABASE_PATH || ".data/boo.sqlite", {
  readOnly: true,
});
try {
  const scalar = (sql) => db.prepare(sql).get().count;
  const visitors = scalar("SELECT COUNT(*) count FROM players");
  const participants = scalar(
    "SELECT COUNT(*) count FROM players WHERE initialized=1",
  );
  const firstWishCompleters = scalar(
    "SELECT COUNT(*) count FROM players WHERE peace_count>0",
  );
  const completedWishes = scalar(
    "SELECT COUNT(*) count FROM progress WHERE peace_at IS NOT NULL",
  );
  const storiesReachedFinalFrame = scalar(
    "SELECT COUNT(*) count FROM story_reads",
  );
  const invitedParticipants = scalar(
    "SELECT COUNT(DISTINCT player_id) count FROM responses WHERE json_extract(result,'$.expired')=0",
  );
  console.log(
    JSON.stringify(
      {
        definitions: {
          visitors: "Browser guest identities, not verified unique humans.",
          invitedParticipants:
            "Distinct guests actively responding to an unexpired invitation; includes non-rewarded Facebook invitations.",
          storyRead:
            "First arrival at the third story frame per guest and character; not proof of reading comprehension.",
          downloads:
            "Outbound HelloTalk clicks only; no install or signup attribution.",
        },
        visitors,
        participants,
        invitedParticipants,
        firstWishCompleters,
        completedWishes,
        storiesReachedFinalFrame,
        firstWishCompletionRate: participants
          ? firstWishCompleters / participants
          : null,
        storyCompletionRate: completedWishes
          ? storiesReachedFinalFrame / completedWishes
          : null,
        events: db
          .prepare("SELECT * FROM analytics ORDER BY day DESC,event,detail")
          .all(),
        ledgerIntegrityErrors: scalar(
          "SELECT COUNT(*) count FROM players p LEFT JOIN (SELECT player_id,SUM(delta) wallet,SUM(CASE WHEN delta>0 THEN delta ELSE 0 END) candies FROM ledger GROUP BY player_id) l ON p.id=l.player_id WHERE p.wallet!=COALESCE(l.wallet,0) OR p.candies!=COALESCE(l.candies,0)",
        ),
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
}
