import { Telegraf, Markup, type Context } from "telegraf";
import pino from "pino";
import { ALL_QUESTIONS } from "./questions.js";
import type { Question, UserSession } from "./types.js";

const logger = pino({ level: process.env["LOG_LEVEL"] ?? "info" });

const sessions = new Map<number, UserSession>();

function escMd(text: string): string {
  return text.replace(/[_*`[\]()~>#+=|{}.!\\-]/g, "\\$&");
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function shuffleAnswers(question: Question): Question {
  const indexed = question.answers.map((a, i) => ({ a, correct: i === question.correctIndex }));
  for (let i = indexed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indexed[i], indexed[j]] = [indexed[j]!, indexed[i]!];
  }
  const correctIndex = indexed.findIndex((x) => x.correct);
  return { ...question, answers: indexed.map((x) => x.a), correctIndex };
}

function startQuiz(userId: number): UserSession {
  const selected = shuffleArray(ALL_QUESTIONS).map(shuffleAnswers);
  const session: UserSession = { questions: selected, currentIndex: 0, score: 0 };
  sessions.set(userId, session);
  return session;
}

function mainMenuKeyboard() {
  return Markup.keyboard([
    ["🚀 Testni boshlash"],
    ["📊 Natijani ko'rish", "❌ Testni to'xtatish"],
  ]).resize();
}

async function sendQuestion(
  ctx: { reply: (text: string, extra?: object) => Promise<unknown> },
  session: UserSession,
): Promise<void> {
  const q = session.questions[session.currentIndex]!;
  const total = session.questions.length;
  const num = session.currentIndex + 1;
  const buttons = q.answers.map((ans, i) =>
    Markup.button.callback(ans.length > 64 ? ans.slice(0, 61) + "..." : ans, `ans_${i}`),
  );
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2) as ReturnType<typeof Markup.button.callback>[]);
  }
  await ctx.reply(`📝 *${num}/${total}\\-savol:*\n\n${escMd(q.question)}`, {
    parse_mode: "MarkdownV2",
    ...Markup.inlineKeyboard(rows),
  });
}

export function startBot(token: string): void {
  logger.info({ questionCount: ALL_QUESTIONS.length }, "Questions loaded");
  const bot = new Telegraf(token);

  async function handleStart(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;
    const firstName = escMd(ctx.from?.first_name ?? "do'st");
    await ctx.reply(
      `📚 *O'zbekiston Tarixi Quiz*\n\nSalom, *${firstName}*\\! 👋\n\nJami *${ALL_QUESTIONS.length} ta savol* bor\\.\nSavollar har safar tasodifiy tartibda beriladi\\.\n\nPastdagi menyudan *Testni boshlash* tugmasini bosing\\!`,
      { parse_mode: "MarkdownV2", ...mainMenuKeyboard() },
    );
  }

  bot.start(handleStart);
  bot.command("menu", handleStart);

  bot.hears("🚀 Testni boshlash", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = startQuiz(userId);
    const firstName = escMd(ctx.from?.first_name ?? "do'st");
    await ctx.reply(
      `🚀 *Test boshlandi\\!*\n\nSalom, *${firstName}*\\!\nJami *${session.questions.length} ta savol* beriladi\\.\nTo'g'ri javobni tanlang\\!`,
      { parse_mode: "MarkdownV2", ...mainMenuKeyboard() },
    );
    await sendQuestion(ctx, session);
  });

  bot.hears("📊 Natijani ko'rish", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = sessions.get(userId);
    if (!session) {
      await ctx.reply("Hozircha test yo'q\\. *Testni boshlash* tugmasini bosing\\.", {
        parse_mode: "MarkdownV2", ...mainMenuKeyboard(),
      });
      return;
    }
    await ctx.reply(
      `📊 Joriy natija: *${session.score}/${session.currentIndex}* \\(${session.questions.length} savoldan\\)`,
      { parse_mode: "MarkdownV2", ...mainMenuKeyboard() },
    );
  });

  bot.hears("❌ Testni to'xtatish", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    sessions.delete(userId);
    await ctx.reply("❌ Test to'xtatildi\\. Qayta boshlash uchun *Testni boshlash* tugmasini bosing\\.", {
      parse_mode: "MarkdownV2", ...mainMenuKeyboard(),
    });
  });

  bot.command("stop", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    sessions.delete(userId);
    await ctx.reply("❌ Test to'xtatildi\\.", { parse_mode: "MarkdownV2", ...mainMenuKeyboard() });
  });

  bot.command("score", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = sessions.get(userId);
    if (!session) {
      await ctx.reply("Hozircha test yo'q\\.", { parse_mode: "MarkdownV2", ...mainMenuKeyboard() });
      return;
    }
    await ctx.reply(`📊 Joriy natija: *${session.score}/${session.currentIndex}*`, {
      parse_mode: "MarkdownV2", ...mainMenuKeyboard(),
    });
  });

  bot.on("callback_query", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const data = (ctx.callbackQuery as { data?: string }).data;
    if (!data?.startsWith("ans_")) { await ctx.answerCbQuery(); return; }
    const session = sessions.get(userId);
    if (!session) { await ctx.answerCbQuery("Test tugagan. Yangi test boshlang."); return; }
    const chosen = parseInt(data.replace("ans_", ""), 10);
    const current = session.questions[session.currentIndex]!;
    const isCorrect = chosen === current.correctIndex;
    if (isCorrect) session.score++;
    const correctAnswer = current.answers[current.correctIndex]!;
    const resultText = isCorrect
      ? `✅ *To'g'ri\\!*`
      : `❌ *Noto'g'ri\\!*\n\nTo'g'ri javob: _${escMd(correctAnswer)}_`;
    try {
      await ctx.editMessageText(
        `📝 *${session.currentIndex + 1}/${session.questions.length}\\-savol:*\n\n${escMd(current.question)}\n\n${resultText}`,
        { parse_mode: "MarkdownV2" },
      );
    } catch {}
    await ctx.answerCbQuery(isCorrect ? "✅ To'g'ri!" : "❌ Noto'g'ri!");
    session.currentIndex++;
    if (session.currentIndex >= session.questions.length) {
      sessions.delete(userId);
      const total = session.questions.length;
      const pct = Math.round((session.score / total) * 100);
      let grade = pct >= 90 ? "🏆 A'lo!" : pct >= 70 ? "👍 Yaxshi!" : pct >= 50 ? "📘 Qoniqarli" : "📖 Ko'proq o'qing!";
      await ctx.reply(
        `🎉 *Test yakunlandi\\!*\n\nNatijangiz: *${session.score}/${total}* \\(${pct}%\\)\nBaho: ${escMd(grade)}\n\nQayta boshlash uchun *Testni boshlash* tugmasini bosing\\.`,
        { parse_mode: "MarkdownV2", ...mainMenuKeyboard() },
      );
    } else {
      await sendQuestion(ctx, session);
    }
  });

  bot.launch().then(async () => {
    logger.info("Telegram quiz bot started successfully");
    await bot.telegram.setMyCommands([
      { command: "start", description: "Botni ishga tushirish" },
      { command: "score", description: "Joriy natijani ko'rish" },
      { command: "stop", description: "Testni to'xtatish" },
      { command: "menu", description: "Asosiy menyuni ochish" },
    ]);
  }).catch((err: unknown) => {
    logger.error({ err }, "Failed to start Telegram bot");
    process.exit(1);
  });

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
