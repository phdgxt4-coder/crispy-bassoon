/**
 * سجل الألعاب الخارجية (صفحات HTML مستقلة)
 * لإضافة لعبة جديدة: أضف عنصرًا هنا + ملف HTML في الجذر + بطاقة في واجهة الألعاب
 */
export const EXTERNAL_GAMES = [
  { id: "memory", file: "memory-game.html", title: "ذاكرة", icon: "🧠" },
  { id: "draw", file: "draw-guess.html", title: "رسم وخمّن", icon: "🎨" },
  { id: "words", file: "words-crush.html", title: "Words Crush", icon: "🔤" },
  { id: "runner", file: "runner.html", title: "Endless Runner", icon: "🏃" },
  { id: "space", file: "space.html", title: "Space Shooter", icon: "🚀" },
  { id: "doodle", file: "doodle.html", title: "Doodle Jump", icon: "🪂" },
  { id: "fishing", file: "fishing.html", title: "صيد السمك", icon: "🎣" },
  { id: "push", file: "push.html", title: "Push Arena", icon: "🧊" },
  { id: "bowling", file: "bowling.html", title: "بولينج", icon: "🎳" },
  { id: "ice", file: "ice.html", title: "تزحلق الجليد", icon: "🧊" },
  { id: "alien", file: "alien.html", title: "دفاع الفضائيين", icon: "👾" },
  { id: "bomber", file: "bomber.html", title: "بومبر", icon: "💣" },
  { id: "tower", file: "tower.html", title: "دفاع القلعة", icon: "🏰" },
  { id: "hide", file: "hide.html", title: "اختباء وبحث", icon: "🎭" },
  { id: "room", file: "room.html", title: "غرفتي", icon: "🏠" },
  { id: "los", file: "last-one-standing.html", title: "آخر واقف", icon: "⚔️" }
];

export function gameById(id) {
  return EXTERNAL_GAMES.find(g => g.id === id) || null;
}

export function gameFileExists(id) {
  const g = gameById(id);
  return !!(g && g.file);
}
